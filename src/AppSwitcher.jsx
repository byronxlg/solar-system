// One site, several apps. A small switcher top-right of the main pane so
// each app links to the others. Paths are relative to the site base.
const APPS = [
  { key: "solar", name: "Solar system", path: "" },
  { key: "gong", name: "Gong", path: "gong/" },
];

export default function AppSwitcher({ current }) {
  const base = import.meta.env.BASE_URL;
  return (
    <nav className="apps" aria-label="Apps">
      {APPS.map((a) => (
        <a key={a.key} href={`${base}${a.path}${window.location.search}`} className={a.key === current ? "current" : ""} aria-current={a.key === current ? "page" : undefined}>
          {a.name}
        </a>
      ))}
    </nav>
  );
}
