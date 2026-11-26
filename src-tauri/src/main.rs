// В релизной сборке не показывать чёрное окно консоли рядом с приложением.
// В debug-сборке консоль остаётся — туда пишутся логи и паники Rust.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    liquid_player_lib::run()
}
