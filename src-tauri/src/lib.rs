//! Точка сборки приложения: здесь регистрируются модули, команды и плагины.
//!
//! Модули:
//!   audio/    — воспроизведение (rodio + symphonia)                 [этап 2]
//!   library/  — база треков, импорт, теги, обложки                  [этап 3]
//!               + appearance.rs: своя обложка, фон, затемнение      [этап 4]
//!               + правка названия/исполнителя/альбома               [этап 5]
//!   lyrics/   — тексты: lrclib.net, LRC-парсер, очередь автопоиска [этап 5]
//!   playlists/ — плейлисты и история прослушиваний                 [этап 6]

mod audio;
mod commands;
mod library;
mod lyrics;
mod playlists;

use tauri::Manager; // даёт app.manage() и app.path()

pub fn run() {
    tauri::Builder::default()
        // Плагин системных диалогов (выбор файлов, папок и картинок)
        .plugin(tauri_plugin_dialog::init())
        // setup выполняется один раз при старте, до открытия окна
        .setup(|app| {
            // Библиотека: база и картинки в папке данных приложения.
            // Переменная окружения LIQUID_PLAYER_DATA_DIR подменяет эту папку —
            // для тестов (чтобы не трогать настоящую библиотеку) и «портативного» режима.
            let data_dir = match std::env::var_os("LIQUID_PLAYER_DATA_DIR") {
                Some(dir) => std::path::PathBuf::from(dir),
                None => app.path().app_data_dir()?,
            };
            let library = library::Library::open(&data_dir)?;

            // Разрешаем интерфейсу показывать картинки ТОЛЬКО из папок covers и images.
            // Делаем это в коде, а не шаблоном в tauri.conf.json: папки уже созданы,
            // и Tauri узнаёт их настоящий путь (Windows может перенаправлять AppData).
            for dir in library.image_dirs() {
                app.asset_protocol_scope().allow_directory(dir, true)?;
            }
            app.manage(library);

            // Тексты песен: HTTP-клиент lrclib.net и очередь фонового поиска
            app.manage(lyrics::LyricsService::new());

            // Аудиопоток. «Пульт» кладём в общее состояние — команды получат его через State
            app.manage(audio::spawn(app.handle().clone()));
            Ok(())
        })
        // Все функции Rust, которые можно вызвать из фронтенда через invoke()
        .invoke_handler(tauri::generate_handler![
            commands::app_info,
            audio::commands::player_load,
            audio::commands::player_get_state,
            audio::commands::player_play,
            audio::commands::player_pause,
            audio::commands::player_toggle,
            audio::commands::player_seek,
            audio::commands::player_set_volume,
            library::commands::library_list,
            library::commands::library_import,
            library::commands::library_remove,
            library::commands::track_update_info,
            library::commands::track_reset_info,
            library::commands::appearance_set_image,
            library::commands::appearance_reset_image,
            library::commands::appearance_set_params,
            lyrics::commands::lyrics_get,
            lyrics::commands::lyrics_fetch,
            lyrics::commands::lyrics_fetch_missing,
            lyrics::commands::lyrics_cancel,
            lyrics::commands::lyrics_search,
            lyrics::commands::lyrics_apply,
            lyrics::commands::lyrics_import_file,
            lyrics::commands::lyrics_save,
            lyrics::commands::lyrics_set_offset,
            lyrics::commands::lyrics_clear,
            playlists::commands::playlists_list,
            playlists::commands::playlist_create,
            playlists::commands::playlist_rename,
            playlists::commands::playlist_delete,
            playlists::commands::playlist_add_tracks,
            playlists::commands::playlist_remove_tracks,
            playlists::commands::playlist_reorder,
            playlists::commands::history_add,
            playlists::commands::history_recent,
            playlists::commands::history_remove,
            playlists::commands::history_clear,
        ])
        // generate_context! на этапе компиляции читает tauri.conf.json
        .run(tauri::generate_context!())
        .expect("не удалось запустить приложение Tauri");
}
