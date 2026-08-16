# Desarrollo de Aplicaciones Multiplataforma con Tauri y React: Un Enfoque Híbrido

## Resumen

Tauri representa un framework moderno para el desarrollo de aplicaciones de escritorio y móviles que optimiza el tamaño de los binarios y el rendimiento del sistema. Este framework implementa una arquitectura híbrida que permite la integración de tecnologías web (HTML, JavaScript, CSS) en el frontend con lenguajes de sistemas de bajo nivel (Rust, Swift, Kotlin) en el backend. La presente documentación describe la configuración del entorno de desarrollo necesario para implementar aplicaciones basadas en esta arquitectura.

## 1. Introducción

### 1.1 Fundamentos de Tauri

Tauri es un framework de código abierto diseñado para la creación de aplicaciones de escritorio multiplataforma que combina tecnologías web con motores de renderización nativos del sistema operativo. A diferencia de soluciones tradicionales como Electron que empaquetan un navegador completo (Chromium) con cada aplicación, Tauri utiliza las bibliotecas WebView nativas del sistema operativo, resultando en binarios significativamente más pequeños (típicamente 600KB-15MB comparado con 50-200MB de Electron) y un menor consumo de memoria RAM.

### 1.2 Arquitectura del Framework

La arquitectura de Tauri se fundamenta en una separación clara entre el proceso principal (Core) escrito en Rust y el proceso de renderizado (Frontend) implementado con tecnologías web. Esta separación proporciona:

- **Seguridad mejorada**: El proceso de Rust actúa como una capa de seguridad entre el frontend web y las APIs del sistema operativo, implementando un sistema de permisos granular.
- **Rendimiento optimizado**: Rust, como lenguaje compilado de bajo nivel sin garbage collector, proporciona un rendimiento cercano al de C/C++ con garantías de seguridad de memoria en tiempo de compilación.
- **Flexibilidad tecnológica**: El frontend puede implementarse con cualquier framework web moderno (React, Vue, Svelte, Angular) o incluso HTML/CSS/JavaScript vanilla.

### 1.3 Justificación de la Combinación React + Tauri

React, biblioteca de JavaScript desarrollada por Meta, se ha consolidado como uno de los frameworks frontend más utilizados en la industria, con una adopción que supera el 40% según encuestas de Stack Overflow. La combinación de React con Tauri ofrece:

- Arquitectura basada en componentes reutilizables
- Virtual DOM para optimización de renderizado
- Ecosistema extenso de librerías y herramientas
- Comunidad activa y documentación abundante
- Integración nativa con TypeScript para tipado estático

## 2. Requisitos del Sistema y Configuración del Entorno

### 2.1 Configuración para Sistemas Linux

La configuración en sistemas basados en Linux (Debian, Ubuntu, y derivados) requiere la instalación de dependencias del sistema, el compilador de Rust y el entorno de ejecución de JavaScript.

#### 2.1.1 Instalación de Dependencias del Sistema

Las siguientes bibliotecas son requeridas para el proceso de compilación y ejecución de aplicaciones Tauri en Linux:

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

Descripción de las dependencias críticas:

- **libwebkit2gtk-4.1-dev**: Biblioteca de desarrollo de WebKitGTK, motor de renderizado web basado en WebKit que proporciona las capacidades de visualización HTML/CSS/JavaScript. WebKit es el mismo motor utilizado por Safari y otros navegadores.
- **build-essential**: Metapaquete que incluye GCC, G++ y make, herramientas fundamentales para compilar código C/C++ que son dependencias de muchas bibliotecas de Rust.
- **libssl-dev**: Biblioteca de desarrollo de OpenSSL, necesaria para operaciones criptográficas y comunicaciones seguras (HTTPS, TLS).
- **libxdo-dev**: Biblioteca para la automatización de interacciones con el sistema de ventanas X11, utilizada para funcionalidades avanzadas de manipulación de ventanas.
- **libayatana-appindicator3-dev**: Proporciona soporte para iconos de bandeja del sistema (system tray), permitiendo que la aplicación se ejecute en segundo plano con indicadores visuales.
- **librsvg2-dev**: Biblioteca para renderizado de gráficos vectoriales SVG, utilizada para iconos y recursos gráficos escalables.

#### 2.1.2 Instalación del Compilador Rust

Rust es un lenguaje de programación de sistemas que garantiza seguridad de memoria sin necesidad de un garbage collector. La instalación se realiza mediante rustup, el gestor oficial de versiones de Rust:

```bash
curl --proto '=https' --tlsv1.2 https://sh.rustup.rs -sSf | sh
```

Este comando descarga e instala:
- **rustc**: El compilador de Rust
- **cargo**: Sistema de construcción y gestor de paquetes de Rust
- **rustup**: Herramienta para gestionar versiones de Rust y componentes del toolchain

Parámetros de seguridad empleados:
- `--proto '=https'`: Fuerza el uso exclusivo del protocolo HTTPS
- `--tlsv1.2`: Especifica TLS versión 1.2 como mínimo para la conexión segura

Tras la instalación, es necesario reiniciar la terminal o ejecutar:

```bash
source $HOME/.cargo/env
```

Para verificar la instalación correcta:

```bash
rustc --version
cargo --version
```

#### 2.1.3 Instalación de Node.js

Node.js es el entorno de ejecución de JavaScript necesario para ejecutar las herramientas de construcción del frontend (Vite, Webpack, etc.) y el gestor de paquetes npm. Se recomienda instalar Node.js versión 18 LTS o superior mediante uno de los siguientes métodos:

**Método 1: Mediante NodeSource (Recomendado para producción)**

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

**Método 2: Mediante nvm (Recomendado para desarrollo)**

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20
```

Verificar la instalación:

```bash
node --version
npm --version
```

## 3. Inicialización del Proyecto

Una vez configurado el entorno, el proyecto Tauri + React puede inicializarse mediante:

```bash
npm create tauri-app@latest
```

Este comando interactivo guiará la selección de:
- Nombre del proyecto
- Framework frontend (seleccionar React)
- Variante de TypeScript (recomendado para proyectos de escala)
- Gestor de paquetes (npm, yarn, pnpm)

## 4. Estructura del Proyecto

La estructura típica de un proyecto Tauri + React incluye:

```
project-root/
├── src/                  # Código fuente React
├── src-tauri/           # Código fuente Rust
│   ├── src/
│   │   └── main.rs      # Punto de entrada Rust
│   ├── Cargo.toml       # Manifiesto de dependencias Rust
│   └── tauri.conf.json  # Configuración de Tauri
├── package.json         # Manifiesto de dependencias Node.js
└── vite.config.ts       # Configuración del bundler
```

## 5. Consideraciones de Seguridad

Tauri implementa un modelo de seguridad basado en:

- **Content Security Policy (CSP)**: Prevención de ataques XSS
- **Sistema de permisos**: Control granular de acceso a APIs del sistema
- **Aislamiento de procesos**: Separación entre frontend y backend
- **Validación de entradas**: Sanitización de datos entre procesos

## 6. Conclusiones

La combinación de Tauri con React representa una alternativa viable y eficiente para el desarrollo de aplicaciones de escritorio modernas. Los beneficios principales incluyen binarios de menor tamaño, consumo optimizado de recursos del sistema, y la capacidad de aprovechar el ecosistema de desarrollo web moderno manteniendo el rendimiento y seguridad de lenguajes de sistemas nativos.

## Referencias

- Tauri Documentation: https://tauri.app/
- React Documentation: https://react.dev/
- Rust Programming Language: https://www.rust-lang.org/
- WebKitGTK: https://webkitgtk.org/


TCP no tiene sentido usado checksum
UDP con checksum 
simular alteraciones en el checksum
intro teorica + framework/herramientas + conclusion

revisar calculo de checksum con sha256
campo para elegir carptea destino
permitir seleccionar o cargar ip recpetora  (tomó la de wifi por defecto)
Enviar, recibir y checkear checksum
