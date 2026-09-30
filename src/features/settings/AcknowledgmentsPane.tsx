import type { MouseEvent } from "react";
import { ACKNOWLEDGMENT_GROUPS } from "./acknowledgments";
import { openProject } from "./openProject";

function openCredit(
  event: MouseEvent<HTMLAnchorElement>,
  href: string,
  onOpen: (href: string) => void,
) {
  event.preventDefault();
  onOpen(href);
}

export function AcknowledgmentsPane({
  onOpen = (href: string) => {
    void openProject(href);
  },
}: {
  onOpen?: (href: string) => void;
} = {}) {
  return (
    <>
      <p className="settings-lead">
        Proudly built on open source. Each name opens the project.
      </p>
      {ACKNOWLEDGMENT_GROUPS.map((group) => {
        const headingId = `settings-ack-${group.id}`;
        return (
          <section
            key={group.id}
            className="settings-block"
            aria-labelledby={headingId}
          >
            <h3 id={headingId} className="settings-block-title">
              {group.title}
            </h3>
            <ul className="settings-credits">
              {group.items.map((item) => (
                <li key={item.name}>
                  <a
                    className="settings-credit"
                    href={item.href}
                    rel="noreferrer"
                    onClick={(event) => openCredit(event, item.href, onOpen)}
                    onAuxClick={(event) => openCredit(event, item.href, onOpen)}
                  >
                    <span className="settings-credit-name">{item.name}</span>
                    <span className="settings-credit-role">{item.role}</span>
                    <span className="settings-credit-license">
                      {item.license}
                      <svg
                        className="settings-credit-out"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <path d="M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z" />
                      </svg>
                    </span>
                    <span className="visually-hidden">Opens in the browser.</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );
}
