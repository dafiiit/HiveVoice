import { MineSection } from "@/components/mine/MineSection";
import { ListingDetail } from "@/components/listings/ListingDetail";

export default async function MyListing({ params }: PageProps<"/me/listings/[id]">) {
  const { id } = await params;
  return <MineSection kind="listings" selected={id} open detail={<ListingDetail id={id} embedded />} />;
}
