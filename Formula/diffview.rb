# frozen_string_literal: true

class Diffview < Formula
  desc "Desktop git diff viewer"
  homepage "https://github.com/sergichafer/diffview"
  license "MIT"
  head "https://github.com/sergichafer/diffview.git", branch: "main"

  # npm ci and cargo fetch need the network during install.
  allow_network_access! :build

  depends_on "cmake" => :build
  depends_on "node" => :build
  depends_on "pkg-config" => :build
  depends_on "rust" => :build
  depends_on :macos

  def install
    ENV["CI"] = "true"
    ENV["CARGO_HOME"] = buildpath/".cargo"
    ENV["npm_config_cache"] = buildpath/".npm"
    # Homebrew superenv forces these, which would dynamically link Homebrew
    # libgit2/openssl. Ad-hoc signed apps cannot load those dylibs on Apple Silicon.
    ENV.delete("LIBGIT2_NO_VENDOR")
    ENV.delete("OPENSSL_NO_VENDOR")

    system "npm", "ci"
    system "npx", "tauri", "build", "--bundles", "app"

    app = buildpath/"src-tauri/target/release/bundle/macos/Diffview.app"
    odie "Diffview.app was not produced" unless app.directory?
    prefix.install app

    macos_dir = prefix/"Diffview.app/Contents/MacOS"
    binary = macos_dir/"diffview"
    binary = macos_dir/"Diffview" unless binary.exist?
    odie "Diffview executable was not produced" unless binary.exist?
    bin.install_symlink binary => "diffview"
  end

  def caveats
    <<~EOS
      Launch with `diffview`. The .app lives in the Homebrew prefix.

      The formula compiles locally and ad-hoc signs the binary. Gatekeeper
      quarantine of a downloaded DMG should not apply.

      brew install --HEAD needs network for npm and crates.io. If those
      downloads fail, clone the repo and run:
        npm ci && npm run tauri build
    EOS
  end

  test do
    binary = bin/"diffview"
    assert_path_exists binary
    assert_predicate binary, :executable?
    linkage = shell_output("otool -L #{binary}")
    refute_match "libssl", linkage
    refute_match %r{libgit2[.]}, linkage
  end
end
