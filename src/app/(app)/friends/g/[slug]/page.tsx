import { FriendsView } from "../../page";

export { generateMetadata } from "@/app/(app)/groups/[slug]/page";

/** Freunde with one of my groups opened on the right: chat first, then the tools the group switched on. */
export default async function FriendsGroup({ params, searchParams }: PageProps<"/friends/g/[slug]">) {
  return <FriendsView sp={await searchParams} group={(await params).slug} />;
}
