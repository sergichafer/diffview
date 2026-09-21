/** Shipped open-source credits. License text ships in THIRD_PARTY_NOTICES.md. */

export interface Acknowledgment {
  name: string;
  role: string;
  license: string;
  href: string;
}

export interface AcknowledgmentGroup {
  id: string;
  title: string;
  items: readonly Acknowledgment[];
}

export const ACKNOWLEDGMENT_GROUPS: readonly AcknowledgmentGroup[] = [
  {
    id: "app",
    title: "App",
    items: [
      {
        name: "Tauri",
        role: "Desktop shell",
        license: "Apache-2.0 or MIT",
        href: "https://github.com/tauri-apps/tauri",
      },
      {
        name: "React",
        role: "Interface",
        license: "MIT",
        href: "https://github.com/facebook/react",
      },
    ],
  },
  {
    id: "diff",
    title: "Diff",
    items: [
      {
        name: "Pierre Diffs",
        role: "Highlighted diffs and editing",
        license: "Apache-2.0",
        href: "https://github.com/pierrecomputer/pierre/tree/main/packages/diffs",
      },
      {
        name: "Pierre Trees",
        role: "File tree",
        license: "Apache-2.0",
        href: "https://github.com/pierrecomputer/pierre/tree/main/packages/trees",
      },
      {
        name: "Pierre Theme",
        role: "Colors for diff syntax",
        license: "Apache-2.0",
        href: "https://github.com/pierrecomputer/pierre/tree/main/packages/theme",
      },
      {
        name: "Shiki",
        role: "Syntax highlighting",
        license: "MIT",
        href: "https://github.com/shikijs/shiki",
      },
    ],
  },
  {
    id: "git",
    title: "Git",
    items: [
      {
        name: "libgit2",
        role: "Repository access",
        license: "GPL-2.0 with linking exception",
        href: "https://github.com/libgit2/libgit2",
      },
      {
        name: "git2",
        role: "Rust bindings for libgit2",
        license: "Apache-2.0 or MIT",
        href: "https://github.com/rust-lang/git2-rs",
      },
    ],
  },
  {
    id: "preview",
    title: "Preview",
    items: [
      {
        name: "marked",
        role: "Markdown",
        license: "MIT",
        href: "https://github.com/markedjs/marked",
      },
      {
        name: "DOMPurify",
        role: "Sanitized HTML",
        license: "MPL-2.0 or Apache-2.0",
        href: "https://github.com/cure53/DOMPurify",
      },
      {
        name: "html-react-parser",
        role: "Preview rendering",
        license: "MIT",
        href: "https://github.com/remarkablemark/html-react-parser",
      },
    ],
  },
  {
    id: "type",
    title: "Type",
    items: [
      {
        name: "Inter",
        role: "UI type",
        license: "SIL OFL 1.1",
        href: "https://github.com/rsms/inter",
      },
      {
        name: "Syne",
        role: "Display type",
        license: "SIL OFL 1.1",
        href: "https://gitlab.com/bonjour-monde/fonderie/syne-typeface",
      },
      {
        name: "IBM Plex",
        role: "Sans and mono",
        license: "SIL OFL 1.1",
        href: "https://github.com/IBM/plex",
      },
      {
        name: "Plus Jakarta Sans",
        role: "UI type",
        license: "SIL OFL 1.1",
        href: "https://github.com/tokotype/PlusJakartaSans",
      },
      {
        name: "JetBrains Mono",
        role: "Code type",
        license: "SIL OFL 1.1",
        href: "https://github.com/JetBrains/JetBrainsMono",
      },
      {
        name: "Source Code Pro",
        role: "Code type",
        license: "SIL OFL 1.1",
        href: "https://github.com/adobe-fonts/source-code-pro",
      },
      {
        name: "Departure Mono",
        role: "Pixel mono",
        license: "SIL OFL 1.1",
        href: "https://github.com/rektdeckard/departure-mono",
      },
    ],
  },
  {
    id: "color",
    title: "Color",
    items: [
      {
        name: "Ayu",
        role: "Color scheme",
        license: "MIT",
        href: "https://github.com/dempfi/ayu",
      },
      {
        name: "Catppuccin",
        role: "Color scheme",
        license: "MIT",
        href: "https://github.com/catppuccin/catppuccin",
      },
    ],
  },
];
