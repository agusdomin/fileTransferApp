# Tauri + React

Tauri es un framework que sirve para crear binarios pequeños y rápidos para las principales plataformas de escritorio y móviles. Los desarrolladores pueden usar cualquier framework de frontend que compile a HTML, JavaScript y CSS para crear su experiencia de usuario, y al mismo tiempo aprovechar lenguajes como Rust, Swift y Kotlin para la lógica del backend cuando sea necesario.

### Linux.

- Instalar librerias 

```bash
apt install libwebkit2gtk-4.1-dev \
  build-essential \
  curl \
  wget \
  file \
  libxdo-dev \
  libssl-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev
```

- Instalar rust

```bash
curl --proto '=https' --tlsv1.2 https://sh.rustup.rs -sSf | sh
```
- Tener node