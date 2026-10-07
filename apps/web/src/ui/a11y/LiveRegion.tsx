// Región aria-live del shell (GDD §2.19): lee el anuncio vigente del store y lo dice. `key={seq}` hace que el
// mismo texto dos veces seguidas se vuelva a anunciar.
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
