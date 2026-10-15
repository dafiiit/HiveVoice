import { ListingDetail } from "@/components/listings/ListingDetail";

export default async function OfferPage({ params }: PageProps<"/offers/[id]">) {
  return <ListingDetail id={(await params).id} kind="offer" />;
}
