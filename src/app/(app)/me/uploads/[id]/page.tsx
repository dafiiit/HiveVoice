import { MineSection } from "@/components/mine/MineSection";
import { LinkView } from "@/app/(app)/links/[id]/page";

export { generateMetadata } from "@/app/(app)/links/[id]/page";

export default async function MineUpload({ params, searchParams }: PageProps<"/me/uploads/[id]">) {
  const { id } = await params;
  return <MineSection kind="uploads" selected={id} open detail={<LinkView id={id} sp={await searchParams} base={`/me/uploads/${id}`} embedded />} />;
}
