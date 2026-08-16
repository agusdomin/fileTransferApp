# Ambito del sistema
Este proyecto es una aplicación de escritorio para la transferencia de archivos entre nodos host. Es un proyecto universitario por lo tanto su objetivo es poner en práctica los protocolos de transporte TCP/UDP, la transferencia de archivos, la verificación de errores con checksums.

# Descripción del sistema
La aplicación en su inicio permite seleccionar el "perfil" del host. Si va a ser receptor o transmisor (quien envia).

## Nodo transmior
El usuario debe indicar IP del recptor, protocolo de transporte y archivos a transmitir.
Si el protocolo elegido es el UDP, para cada archivo se calcula un checksum a traves del algoritimo seleccionado, para que sea transmitido con cada archivo a fin de que el receptor pueda detectar errores.
Si el protocolo es TCP, se comprende que el analisis de checksum se realiza automaticamente a nivel de protocolo y no es necesario a nivel de aplicación.


## Nodo receptor

El nodo receptor para comenzar a recepcionar archivos debe confirmar la IP por la cual recepcionará archivos (el puerto se maneja por defecto) y la carpeta destino.


Ambos nodos poseen un monitor de logs.