"use server";
import { revalidatePath } from "next/cache";
import { run } from "../action";
import type { Tx } from "../db";
import { cleanAttrs, isCategory, type Category } from "../market";

export type ListingInput = {
  kind: "offer" | "need";
  title: string;
  description: string;
  detailsPrivate: string;
  payMode: "free" | "hourly" | "fixed" | "swap";
  rateEuro: string;
  fixedEuro: string;
  swapText: string;
  locationText: string;
  scheduleText: string;
  isRecurring: boolean;
  seats: string;
  seekingAllies: boolean;
  tags: string[];
  regionId: string | null;
  responsibilityIds: string[];
  groupId?: string;
  images?: string[];
  category?: Category;
  attrs?: Record<string, unknown>;
  /** The other half of a swap: an offer that expects something in return also becomes a request, and the other way round. */
  pair?: { title: string; description: string; category: Category; tags: string[] } | null;
};

const cents = (s: string) => (s ? String(Math.round(Number(s.replace(",", ".")) * 100) || "") : "");

async function insertListing(tx: Tx, input: ListingInput) {
  const category = isCategory(input.category) ? input.category : "help";
  const [{ id }] = await tx<{ id: string }[]>`select app.save_listing(${tx.json({
    kind: input.kind, title: input.title, description: input.description, details_private: input.detailsPrivate,
    pay_mode: input.payMode, hourly_rate_cents: input.payMode === "hourly" ? cents(input.rateEuro) : "",
    fixed_price_cents: input.payMode === "fixed" ? cents(input.fixedEuro) : "", swap_text: input.payMode === "swap" ? input.swapText : "",
    location_text: input.locationText, schedule_text: input.scheduleText, is_recurring: input.isRecurring, seats: input.seats,
    seeking_allies: input.seekingAllies, tags: input.tags, region_id: input.regionId ?? "", group_id: input.groupId ?? "",
    category, attrs: cleanAttrs(category, input.attrs),
  })}) as id`;
  return id;
}

/** Lets the Edge Function compute missing embeddings (it only works off pending listings). Never fails the save. */
async function embedListings() {
  try {
    await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/embed-listings`, { method: "POST", signal: AbortSignal.timeout(10_000) });
  } catch {
    // The next save picks it up.
  }
}

export async function saveListing(input: ListingInput) {
  const res = await run(async (tx) => {
    const id = await insertListing(tx, input);
    if (input.images?.length) await tx`select app.set_listing_images(${id}, ${input.images.slice(0, 4)}::text[])`;
    for (const rid of input.responsibilityIds.slice(0, 3)) {
      await tx`select app.create_request(${tx.json({ responsibility_id: rid, listing_id: id, body: [input.title, input.description].filter(Boolean).join("\n\n") })})`;
    }
    let pairId: string | null = null;
    const pair = input.payMode === "swap" ? input.pair : null;
    if (pair && pair.title.trim().length >= 3) {
      pairId = await insertListing(tx, {
        ...input, kind: input.kind === "offer" ? "need" : "offer", title: pair.title.trim(), description: pair.description, detailsPrivate: "",
        category: pair.category, attrs: {}, swapText: input.title, seats: "", seekingAllies: false, scheduleText: "", isRecurring: false,
        tags: pair.tags, responsibilityIds: [], images: [], pair: null,
      });
      await tx`select app.pair_listings(${id}, ${pairId})`;
    }
    return { id, pairId };
  });
  if (res.ok) {
    // Matching by meaning needs the embedding, so compute it first, then tell the people whose listings fit.
    await embedListings();
    await run(async (tx) => {
      for (const l of [res.data.id, res.data.pairId]) if (l) await tx`select app.notify_listing_matches(${l})`;
      return null;
    });
  }
  revalidatePath("/me/listings"); revalidatePath("/community/listings");
  revalidatePath("/community", "layout");
  return res;
}

export async function setListingStatus(id: string, status: "active" | "paused" | "closed", kind: "offer" | "need") {
  const res = await run(async (tx) => {
    await tx`update public.listings set status = ${status}::public.listing_status where id = ${id}`;
    return null;
  });
  void kind;
  revalidatePath("/me/listings"); revalidatePath("/community/listings");
  return res;
}

export async function requestContact(listingId: string, message: string, viaListingId?: string | null) {
  const res = await run(async (tx) => {
    const [{ id }] = await tx<{ id: string }[]>`select app.request_contact(${listingId}, ${message}, ${viaListingId || null}::uuid) as id`;
    return id;
  });
  revalidatePath("/me/listings"); revalidatePath("/community/listings");
  revalidatePath("/friends");
  return res;
}

export async function decideContact(requestId: string, accept: boolean) {
  const res = await run(async (tx) => {
    const [{ c }] = await tx<{ c: string | null }[]>`select app.decide_contact(${requestId}, ${accept}) as c`;
    return c;
  });
  revalidatePath("/me/listings"); revalidatePath("/community/listings");
  revalidatePath("/friends");
  return res;
}

export async function withdrawContact(requestId: string) {
  const res = await run(async (tx) => {
    await tx`update public.contact_requests set status = 'withdrawn' where id = ${requestId}`;
    return null;
  });
  revalidatePath("/me/listings"); revalidatePath("/community/listings");
  revalidatePath("/friends");
  return res;
}

export async function toggleAlly(listingId: string, on: boolean) {
  const res = await run(async (tx, s) => {
    if (on) await tx`insert into public.listing_allies (listing_id, profile_id) values (${listingId}, ${s.profile.id}) on conflict do nothing`;
    else await tx`delete from public.listing_allies where listing_id = ${listingId} and profile_id = ${s.profile.id}`;
    return null;
  });
  revalidatePath("/me/listings"); revalidatePath("/community/listings");
  return res;
}

/** Title and description, for the owner and for people with editing rights. */
export async function updateListing(id: string, title: string, description: string, path: string) {
  const res = await run(async (tx) => {
    if (title.trim().length < 3) throw new Error("invalid");
    await tx`select app.save_listing(${tx.json({ id, title: title.trim().slice(0, 200), description: description.slice(0, 5000) })})`;
    return null;
  });
  revalidatePath(path);
  return res;
}
