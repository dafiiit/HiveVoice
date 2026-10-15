"use server";
import { revalidatePath } from "next/cache";
import { run } from "../action";

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
};

const cents = (s: string) => (s ? String(Math.round(Number(s.replace(",", ".")) * 100) || "") : "");

export async function saveListing(input: ListingInput) {
  const res = await run(async (tx) => {
    const [{ id }] = await tx<{ id: string }[]>`select app.save_listing(${tx.json({
      kind: input.kind, title: input.title, description: input.description, details_private: input.detailsPrivate,
      pay_mode: input.payMode, hourly_rate_cents: input.payMode === "hourly" ? cents(input.rateEuro) : "",
      fixed_price_cents: input.payMode === "fixed" ? cents(input.fixedEuro) : "", swap_text: input.payMode === "swap" ? input.swapText : "",
      location_text: input.locationText, schedule_text: input.scheduleText, is_recurring: input.isRecurring, seats: input.seats,
      seeking_allies: input.seekingAllies, tags: input.tags, region_id: input.regionId ?? "", group_id: input.groupId ?? "",
    })}) as id`;
    if (input.images?.length) await tx`select app.set_listing_images(${id}, ${input.images.slice(0, 4)}::text[])`;
    for (const rid of input.responsibilityIds.slice(0, 3)) {
      await tx`select app.create_request(${tx.json({ responsibility_id: rid, listing_id: id, body: [input.title, input.description].filter(Boolean).join("\n\n") })})`;
    }
    return id;
  });
  revalidatePath(input.kind === "offer" ? "/offers" : "/needs");
  return res;
}

export async function setListingStatus(id: string, status: "active" | "paused" | "closed", kind: "offer" | "need") {
  const res = await run(async (tx) => {
    await tx`update public.listings set status = ${status}::public.listing_status where id = ${id}`;
    return null;
  });
  revalidatePath(kind === "offer" ? "/offers" : "/needs");
  return res;
}

export async function requestContact(listingId: string, message: string) {
  const res = await run(async (tx) => {
    const [{ id }] = await tx<{ id: string }[]>`select app.request_contact(${listingId}, ${message}) as id`;
    return id;
  });
  revalidatePath("/offers");
  revalidatePath("/needs");
  revalidatePath("/connect");
  return res;
}

export async function decideContact(requestId: string, accept: boolean) {
  const res = await run(async (tx) => {
    const [{ c }] = await tx<{ c: string | null }[]>`select app.decide_contact(${requestId}, ${accept}) as c`;
    return c;
  });
  revalidatePath("/offers");
  revalidatePath("/needs");
  revalidatePath("/connect");
  return res;
}

export async function withdrawContact(requestId: string) {
  const res = await run(async (tx) => {
    await tx`update public.contact_requests set status = 'withdrawn' where id = ${requestId}`;
    return null;
  });
  revalidatePath("/offers");
  revalidatePath("/needs");
  revalidatePath("/connect");
  return res;
}

export async function toggleAlly(listingId: string, on: boolean) {
  const res = await run(async (tx, s) => {
    if (on) await tx`insert into public.listing_allies (listing_id, profile_id) values (${listingId}, ${s.profile.id}) on conflict do nothing`;
    else await tx`delete from public.listing_allies where listing_id = ${listingId} and profile_id = ${s.profile.id}`;
    return null;
  });
  revalidatePath("/needs");
  return res;
}
