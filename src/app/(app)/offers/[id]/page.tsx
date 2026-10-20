import { ListingDetail } from "@/components/listings/ListingDetail";

export default async function OfferPage({ params, searchParams }: PageProps<"/offers/[id]">) {
  const k = (await searchParams).k;
  return <ListingDetail id={(await params).id} kind="offer" linkToken={typeof k === "string" ? k : null} />;
}
