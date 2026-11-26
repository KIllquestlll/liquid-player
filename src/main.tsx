import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/inter"; // шрифт Inter лежит локально — работает без интернета
import "./styles/global.css"; //   токены, базовые элементы, кнопки
import "./styles/layout.css"; //   каркас: меню, панель плеера, фон, полноэкранный плеер
import "./styles/controls.css"; // ползунки, прогресс, кнопки управления
import "./styles/views.css"; //    зоны: Главная, Моя музыка, Админ-панель
import "./styles/lyrics.css"; //   тексты песен
import "./styles/playlists.css"; // плейлисты, меню «+», Главная
import App from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
