// Shell aria-live region (GDD §2.19): reads the current announcement from the store and speaks it. `key={seq}` makes
// the same text twice in a row get announced again.
import { tDynamic } from "../../i18n";
import { selectAnnouncement, useGameView } from "../../state/selectors";

export function LiveRegion() {
  const announcement = useGameView(selectAnnouncement);
  return (
    <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
      {announcement ? (
        <span key={announcement.seq}>{tDynamic(announcement.key, announcement.params, announcement.keyParams)}</span>
      ) : null}
    </div>
  );
}
