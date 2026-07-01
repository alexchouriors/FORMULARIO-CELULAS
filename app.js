// app.js
// Genera corazones y caras enamoradas que flotan hacia arriba de forma continua.

(function () {
  const contenedor = document.getElementById("floating-container");
  const emojisPosibles = ["💗", "💖", "💕", "❤️", "😍", "🥰", "💘", "💝"];

  function crearEmojiFlotante() {
    const emoji = document.createElement("span");
    emoji.className = "emoji-flotante";
    emoji.textContent =
      emojisPosibles[Math.floor(Math.random() * emojisPosibles.length)];

    // Posición horizontal aleatoria
    const posicionX = Math.random() * 100; // en %
    emoji.style.left = posicionX + "vw";

    // Tamaño aleatorio
    const tamano = 18 + Math.random() * 26; // entre 18px y 44px
    emoji.style.fontSize = tamano + "px";

    // Duración y desplazamiento lateral aleatorios para que no se vea repetitivo
    const duracion = 6 + Math.random() * 6; // entre 6s y 12s
    emoji.style.animationDuration = duracion + "s";

    const deriva = (Math.random() - 0.5) * 160; // entre -80px y 80px
    emoji.style.setProperty("--drift", deriva + "px");

    contenedor.appendChild(emoji);

    // Elimina el emoji del DOM cuando termina su animación
    setTimeout(() => {
      emoji.remove();
    }, duracion * 1000 + 200);
  }

  // Crea un emoji nuevo cada cierto intervalo
  setInterval(crearEmojiFlotante, 350);

  // Genera algunos de inmediato al cargar la página
  for (let i = 0; i < 12; i++) {
    setTimeout(crearEmojiFlotante, i * 150);
  }
})();
