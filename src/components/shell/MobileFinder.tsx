import { getSession } from "@/lib/session";
import { getPlace } from "@/lib/place";
import { QuickSearch } from "./QuickSearch";
import { PlaceMenu } from "./PlaceMenu";

/** On phones the search and the place leave the top bar to save room; Entdecken shows them right under it. */
export async function MobileFinder() {
  const session = await getSession();
  const place = await getPlace();
  return (
    <div className="flex items-center gap-2 md:hidden">
      <QuickSearch />
      <PlaceMenu signedIn={!!session} place={place ? { id: place.id, name: place.name, level: place.level, chain: place.chain } : null} />
    </div>
  );
}
