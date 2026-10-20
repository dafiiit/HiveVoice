import { ListingDetail } from "@/components/listings/ListingDetail";

/** One offer or one wanted post; which of the two it is, the listing itself says. */
export default async function ListingPage({ params, searchParams }: PageProps<"/listings/[id]">) {
  const k = (await searchParams).k;
  return <ListingDetail id={(await params).id} linkToken={typeof k === "string" ? k : null} />;
}
