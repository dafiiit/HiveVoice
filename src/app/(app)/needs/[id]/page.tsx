import { ListingDetail } from "@/components/listings/ListingDetail";

export default async function NeedPage({ params }: PageProps<"/needs/[id]">) {
  return <ListingDetail id={(await params).id} kind="need" />;
}
