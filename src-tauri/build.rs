// Запускается cargo ПЕРЕД компиляцией приложения:
// читает tauri.conf.json, права (capabilities) и иконку для .exe.
fn main() {
    tauri_build::build()
}
