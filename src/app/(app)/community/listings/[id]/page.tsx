import { ListingsSection } from "@/components/community/ListingsSection";

export default async function CommunityListing({ params, searchParams }: PageProps<"/community/listings/[id]">) {
  return <ListingsSection sp={await searchParams} id={(await params).id} />;
}
