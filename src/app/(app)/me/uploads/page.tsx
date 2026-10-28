import { getTranslations } from "next-intl/server";
import { MineSection } from "@/components/mine/MineSection";
import { MyDocsSide } from "@/components/mine/MyDocsSide";
import { getSession } from "@/lib/session";
import { links } from "@/lib/nextcloud";

export async function generateMetadata() {
  return { title: (await getTranslations("mine.filters"))("uploads") };
}

/** Before one is opened: the Nextcloud gallery (when chosen), hand-overs, what others shared with me, the trash and the storage used. */
export default async function MineUploads({ searchParams }: PageProps<"/me/uploads">) {
  const sp = await searchParams;
  const more = sp.more === "1";
  const sub = typeof sp.nc === "string" ? sp.nc : "";
  // With a Nextcloud gallery the page stays on it instead of opening the newest upload by itself.
  const session = await getSession();
  const gallery = session ? (await links({ authId: session.authId, profileId: session.profile.id }).catch(() => [])).some((l) => !l.group_id && l.owner_id === session.profile.id && l.folder) : false;
  return <MineSection kind="uploads" open={false} auto={!more && !gallery} detail={<MyDocsSide kind="uploads" sub={sub} />} />;
}
