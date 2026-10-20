import { ListingDetail } from "@/components/listings/ListingDetail";

export default async function NeedPage({ params, searchParams }: PageProps<"/needs/[id]">) {
  const k = (await searchParams).k;
  return <ListingDetail id={(await params).id} kind="need" linkToken={typeof k === "string" ? k : null} />;
}
