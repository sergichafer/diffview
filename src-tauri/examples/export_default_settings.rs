fn main() {
    let json = serde_json::to_string_pretty(&diffview_lib::settings::AppSettings::default())
        .expect("serialize default settings");
    println!("{json}");
}
