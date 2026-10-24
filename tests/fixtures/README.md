# Clip original de pruebas

`yoru-player-test.webm` es una composición gráfica creada expresamente para estas pruebas: fondo oscuro, cuadro y línea ámbar, sin imágenes externas, personajes, audio ni series. Se puede usar y redistribuir con este proyecto.

Generación (FFmpeg, libvpx):

```sh
ffmpeg -f lavfi -i 'color=c=0x121722:s=640x360:r=12:d=4' \
  -vf 'drawbox=x=40+80*t:y=130:w=100:h=100:color=0xffbe55:t=fill,drawbox=x=40:y=300:w=560:h=2:color=0xffbe55:t=fill' \
  -c:v libvpx -b:v 100k -an yoru-player-test.webm
```

Playwright intercepta las URLs externas y responde con este clip o un documento de iframe controlado que lo utiliza. Ninguno de estos ficheros se publica en `public/`, `dist/` ni Cloudflare. La URL de iframe tiene el formato oficial de YouTube sin cookies para *Big Buck Bunny*, Blender Foundation, CC BY 3.0 (`aqz-KE-bpKQ`); el iframe real no se contacta durante la suite. La URL de Sintel de W3C se usa como dato permitido en pruebas SQL/unitarias, sin descargarla. No se insertan fuentes ni fichas de prueba en Supabase remoto.
