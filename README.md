# BMW Atelier

Showroom de concesionario BMW con **Angular 21, Three.js y Spring Boot 3.5 / Java 21**. Interfaz en español, adaptable a móvil, con configuración 3D y presupuestos persistentes.

## Arrancar en desarrollo

Requisitos: Node.js 24 y JDK 21 o superior. Configura `JAVA_HOME` apuntando a tu JDK. Maven Wrapper descarga Maven 3.9.11 en el primer arranque; no necesitas instalar Maven por separado.

Terminal 1, desde la raíz del proyecto:

```powershell
cd backend
.\mvnw.cmd spring-boot:run
```

Terminal 2:

```powershell
cd frontend
npm ci
npm start
```

Abre http://127.0.0.1:4200. Angular reenvía `/api` al servidor en el puerto 8080; no es necesario habilitar CORS. En macOS/Linux usa `./mvnw` en lugar de `mvnw.cmd`.

## Experiencia disponible

- BMW M4 Competition, BMW 330i E46, BMW M2 G87, BMW M3 E92 y BMW E36 Street con archivos GLB independientes, rotación 360° con ratón, gestos o flechas; zoom con rueda o +/−. El E46 se descarga cuando se selecciona por primera vez (unos 35 MB para el coche completo).
- Iluminación de estudio generada localmente, pintura con barniz y microtextura, cristales con transmisión física y sombras de contacto proyectadas desde la geometría. Se conservan las texturas originales de carbono, neumáticos y detalles de las ruedas. El realismo sigue limitado por la malla y las texturas del modelo de origen.
- Cámara interior desde el puesto del conductor, con campo de visión de 82°. Arrastra con ratón o dedo para mirar alrededor sin desplazar la cámara fuera del asiento. También funcionan las cuatro flechas; + / − ajustan el ángulo entre 60° y 95°, e Inicio centra la mirada. La tapicería conserva su color al cambiar de dirección.
- Habitáculo con vinilo no metálico, mapas de detalle de cuero CC0 de Poly Haven y oclusión ambiental de corto alcance, calculada solo en la vista interior. Los cristales no participan como superficies opacas en ese cálculo. El color de tapicería usa una máscara espacial aproximada porque el GLB comparte materiales entre asientos y molduras.
- Despiece animado por grupos visuales: carrocería, acristalamiento, habitáculo y cuatro ruedas. Se activa manualmente desde sus controles; cambiar pintura, llantas o tapicería conserva la vista elegida.
- Doce pinturas, dos acabados de llantas y cinco colores de tapicería: Negro, Tartufo, Silverstone, Burdeos y Azul Noche. Los dos nuevos interiores tienen un suplemento de demostración de 2.200 €. Se añaden Rojo Rubí, Naranja Cobre, Amarillo Solar, Violeta Amatista, Azul Hielo, Azul Medianoche y Plata Titanio a la paleta exterior de demostración. Los cambios son de materiales; no sustituyen geometría por piezas OEM ni garantizan disponibilidad de fábrica.
- Catálogo de cinco modelos: M4 Competition, 330i E46, M2 G87, M3 E92 y E36 Street. i4 retirado del selector y de los presupuestos del servidor. Las configuraciones antiguas con modelos retirados vuelven al M4 al abrir la web. Las fichas, precios y opciones son de demostración; los acabados no representan un catálogo de fábrica del E46.
- Resumen con botón Comprar, QR para completar el pedido desde el móvil, restauración local, enlaces de configuración y descarga JSON.
- El presupuesto y el pedido se validan en Spring Boot. Si el servidor no está disponible se puede compartir o descargar la selección, pero no confirmar una compra.
- Navegación por teclado, diálogos nativos, avisos accesibles y respeto por movimiento reducido.

## Validar

```powershell
cd frontend
npm run build
npm run test:qr
npm run test:viewer
```

```powershell
cd backend
.\mvnw.cmd verify
```

Las 16 pruebas de integración verifican precios, opciones, mayoría de edad, caducidad, concurrencia, pedidos únicos y reintentos de email. El QR se decodifica con una biblioteca independiente. GitHub Actions compila Angular, verifica el QR y ejecuta `verify` de Maven en cada PR y push a `main` o `feat/**`.

## Rendimiento del visor

El visor dibuja bajo demanda: se detiene al quedar quieto, al salir de pantalla o al ocultar la pestaña. El giro automático, la inercia y las transiciones siguen animándose, con un máximo de 60 FPS y un reloj que mantiene ese límite en pantallas de 60 a 240 Hz. Solo se descarga y adapta cada modelo cuando se selecciona; los modelos ocultos no participan en la animación.

Las geometrías opacas con el mismo material se agrupan respetando sus desplazamientos de despiece. Para el exterior ensamblado se utiliza una segunda representación que permite agrupar también entre piezas. Comparte los materiales y conserva todos los vértices y texturas; al activar el despiece o entrar en el habitáculo se muestran las piezas originales. Solo se conserva una representación ensamblada adicional a la vez. Las variantes de ruedas del E46 mantienen sus controles de visibilidad y las superficies transparentes conservan sus límites de ordenación.

La resolución se limita a DPR 1,5 y aproximadamente 1,2 millones de píxeles, baja temporalmente durante el movimiento y se ajusta más si los fotogramas siguen siendo lentos. La resolución de reposo se recupera al detenerse. La refracción usa una captura reducida; la oclusión del habitáculo se restaura al finalizar el desplazamiento de cámara. No se simplifican las mallas ni se sustituyen los interiores.

En desarrollo, añade `viewerStats=1` a la URL para mostrar FPS, llamadas de dibujo, resolución y un contador de fotogramas. El contador debe dejar de aumentar en reposo; la compilación de producción no muestra este diagnóstico. Las llamadas reflejan el último render de Three.js; los pases del compositor interior tienen sus propias estadísticas. En la prueba local del E36, el exterior pasó de 473 a 239 llamadas con la agrupación por movimiento y a 161 con la representación ensamblada. Son medidas de esa escena y cámara, no una garantía de FPS en otros equipos.

`npm run test:viewer` comprueba conservación de geometría/materiales, despiece, variantes de ruedas, transparencia, liberación de los buffers adicionales, adaptación de resolución y cadencia en pantallas de 30 a 240 Hz. Para el giro WebGL también es necesaria la aceleración gráfica del navegador.

## API

| Método | Ruta | Resultado |
|---|---|---|
| GET | `/api/health` | Estado del servicio |
| GET | `/api/catalog` | Modelos y opciones de demostración |
| POST | `/api/quotes` | Presupuesto validado y calculado |
| POST | `/api/configurations` | Guarda y devuelve UUID y precio |
| GET | `/api/configurations/{uuid}` | Recupera una configuración |
| POST | `/api/checkouts` | Congela el coche, acabados y precio; genera un enlace de compra de 30 minutos |
| GET | `/api/checkouts/{uuid}` | Configuración y estado del pedido, sin datos del comprador |
| POST | `/api/checkouts/{uuid}/orders` | Valida los datos, registra el pedido y prepara su email |

Ejemplo de entrada para ambos POST:

```json
{"model":"m4","paint":"green","wheels":"forged","interior":"cognac"}
```

El resultado orientativo para este ejemplo es 130.600 EUR. Opciones desconocidas o incompletas devuelven 400; una configuración inexistente devuelve 404. Los registros H2 se guardan en `backend/data/` (ignorado por Git). Los UUID permiten recuperar configuraciones por enlace conocido; no hay cuentas ni listado público de registros.

## Compra mediante QR y confirmación por email

«Ver mi configuración» → «Comprar» genera un QR que abre `/?checkout=<uuid>`. El formulario pide nombre completo, edad y correo. Se exigen 18 años cumplidos y una edad entera, tanto en Angular como en Spring Boot. La edad se declara en el formulario; no se verifica un documento de identidad. No hay pasarela ni cobro.

El servidor conserva el coche y sus acabados al crear el QR; calcula el total sin confiar en importes del navegador. El enlace caduca a los 30 minutos. Cada QR admite un solo pedido: repetir la misma solicitud devuelve su referencia, incluso con envíos simultáneos. Un comprador distinto recibe 409; un enlace caducado, 410.

El pedido guarda nombre, edad y correo en la base de datos local. El QR, las respuestas públicas y los logs de envío no contienen estos datos. El email incluye nombre, referencia, coche, acabados e importe; no incluye la edad. Un fallo SMTP conserva el pedido y reintenta hasta cinco veces. La pantalla distingue correo pendiente, enviado, preparado en local y fallo de entrega. «Enviado» significa aceptado por el servidor SMTP, no garantiza que llegue a la bandeja de entrada.

Por defecto `ORDER_MAIL_MODE=preview`: se genera un mensaje `.eml` en `backend/data/mail-preview/`, sin enviar correo real. La interfaz indica este modo. Los mensajes y la base de datos están ignorados por Git y no se sirven como archivos web.

### Servicio gratuito: Brevo

La conexión está preparada para **Brevo Free**, cuyo plan ofrece actualmente 300 envíos diarios, incluidos correos transaccionales ([plan oficial](https://help.brevo.com/hc/en-us/articles/208589409-About-Brevo-s-pricing-plans)). Hace falta una cuenta propia, un remitente verificado y las credenciales de la pestaña SMTP de Brevo. La contraseña es una **clave SMTP**, no una API key ni la contraseña de la cuenta ([configuración oficial](https://help.brevo.com/hc/en-us/articles/7924908994450-Send-transactional-emails-using-Brevo-SMTP)).

Define `ORDER_MAIL_FROM` con el remitente verificado, `SMTP_USERNAME` con el login SMTP y `SMTP_PASSWORD` con la clave SMTP como variables de entorno del proceso. Arranca desde `backend` con:

```powershell
java -jar target/bmw-atelier-1.0.0.jar --server.address=127.0.0.1 --spring.profiles.active=brevo
```

El perfil `brevo` activa SMTP en `smtp-relay.brevo.com:587`, con autenticación y STARTTLS obligatorio. No se incluyen credenciales. Para Docker, copia `.env.example` a `.env`, completa los valores y cambia `ORDER_MAIL_MODE=smtp`; Compose los pasa al contenedor. Java/Maven no cargan `.env` automáticamente. Mantén las claves fuera del repositorio y del frontend.

En Windows puedes evitar introducir la clave en un comando o archivo de texto. Desde la raíz del proyecto, ejecuta `powershell -File .\scripts\configure-brevo.ps1`: pide el remitente verificado, el login SMTP y la clave con entrada oculta. Guarda la clave cifrada mediante DPAPI para tu usuario de Windows en `backend/data/brevo.credentials.xml`, ignorado por Git. El asistente solo guarda la configuración; no envía mensajes. No compartas este archivo ni captures la clave en pantalla.

Después de detener el backend anterior, `powershell -File .\scripts\start-brevo.ps1` arranca el servidor con esas credenciales. Para el QR de la red local puedes añadir `-CheckoutPublicUrl http://<IP-privada-del-PC>:4300` y mantener el puente móvil iniciado. La clave se pasa al proceso Java mediante su entorno, nunca por argumentos de línea de comandos. Solo se podrá descifrar con el mismo usuario de Windows en este equipo.

### Escanear desde el móvil en la red local

El QR necesita una URL accesible desde el teléfono: `localhost` en el móvil apunta al propio teléfono. Con ambos dispositivos en la misma red, compila Angular y sirve esa compilación mediante el puente incluido, indicando la IPv4 privada del PC:

```powershell
npm --prefix frontend run build
node scripts/checkout-preview.cjs --host <IP-privada-del-PC>
```

Arranca el backend en `127.0.0.1:8080` con `CHECKOUT_PUBLIC_URL=http://<IP-privada-del-PC>:4300`, o abre directamente la web en esa dirección y deja `CHECKOUT_PUBLIC_URL` vacío. El puente sirve únicamente la compilación web y su API, en la interfaz indicada; no expone la carpeta de datos, no modifica el firewall y se detiene con Ctrl+C. No uses la interfaz de una VPN. Una red con aislamiento entre dispositivos puede impedir el acceso. Para publicar la aplicación, usa su origen HTTPS como `CHECKOUT_PUBLIC_URL`.

## Ejecutar con Docker

```sh
docker compose up --build
```

Abre http://127.0.0.1:8080. La imagen compila Angular, lo integra como recursos estáticos de Spring Boot y ejecuta la API y la web en un mismo origen. El volumen conserva los registros H2. El contenedor usa un usuario sin privilegios. Esta opción requiere Docker; su construcción no se ha validado en este equipo.

Variables opcionales: `PORT`, `DATABASE_URL`, `DATABASE_USERNAME`, `DATABASE_PASSWORD`. La configuración por defecto usa H2. Para PostgreSQL hay que añadir el driver correspondiente y una configuración de migraciones antes de cambiar la URL.

## Estructura

```text
frontend/        Angular + Three.js + modelo y licencias
backend/         Spring Boot + validación + JPA/H2 + pruebas
.github/         CI para ambos proyectos
Dockerfile       Compilación y empaquetado de la aplicación completa
compose.yaml     Ejecución local con datos persistentes
```

## Modelo 3D y alcance

“BMW M4 Competition M Package” por **𝙎𝙍𝙏 𝙋𝙚𝙧𝙛𝙤𝙢𝙖𝙣𝙘𝙚™**, publicado bajo [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). [Fuente original](https://sketchfab.com/3d-models/bmw-m4-competition-m-package-5c0a2dafb1ad408d9fc9eeef9aee531b), [redistribución GLB](https://github.com/coopercodes/bmwGLB) y [atribución y cambios](frontend/public/models/ATTRIBUTION.md). El GLB original conserva los créditos embebidos y pesa unos 23 MB; se descarga una vez por sesión del visor. Las tipografías DM Sans y Manrope se sirven localmente; sus licencias están en los paquetes de Fontsource.

Mapas de normal y rugosidad de [Leather White](https://polyhaven.com/a/leather_white), de Rob Tuytel / Poly Haven, bajo CC0. Se sirven localmente a 1024×1024 (1,35 MB entre ambos); [créditos](frontend/public/textures/ATTRIBUTION.md). No se ha sustituido el M4 por otro modelo: el habitáculo conserva geometría y atlas originales de resolución limitada. Estos ajustes de materiales no equivalen a un interior fotorrealista. El proyecto mantiene la restricción de utilizar recursos gratuitos.

"BMW 3-Series E46 1998-2006", de **Merc_TV**, bajo CC BY 4.0: [obra original](https://sketchfab.com/3d-models/bmw-3-series-e46-1998-2006-2e32a3e273ab482b83970603539de06a), [redistribución GLB](https://github.com/AzizSyed27/MyE46/blob/main/public/models/e46.glb). Se utiliza el modelo completo de cuatro puertas, con su propio exterior y habitáculo, identificado como 330i E46. Un único sistema de coordenadas conserva el encaje de puertas, techo, cristales, asientos y salpicadero. El adaptador selecciona una sola variante de carrocería y un juego de llantas a la vez. Los materiales y los gráficos ilustrativos de los instrumentos se ajustan en ejecución; la geometría original se conserva. El precio base de 35.000 € es una cifra ficticia de demostración, no una tasación ni una oferta.

La animación separa grupos de geometría/materiales y no representa un desmontaje mecánico exacto. El modelo del autor puede incluir accesorios distintos de la ficha ilustrativa. La experiencia es un prototipo funcional, no un concesionario operativo ni una réplica del configurador oficial. Para una versión comercial faltan catálogo/precios reales, modelos autorizados de cada vehículo, piezas independientes, autenticación administrativa, límites de uso de la API y un servicio de atención comercial.

Proyecto independiente, sin afiliación con BMW AG. Marcas y nombres pertenecen a sus titulares.

Se ha retirado la combinación anterior de carrocería GTR e interior ajeno, junto con el extractor de habitáculo. El E46 se carga desde un único GLB con créditos y licencia incorporados. Sus texturas originales tienen limitaciones: el detalle del modelo mejora el habitáculo, pero no equivale a una reconstrucción fotorrealista.

## BMW M2 G87

Modelo completo gratuito de **Black Snow**, bajo [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/): [obra original](https://sketchfab.com/3d-models/bmw-m2-g87-free-125412579b244790b27b2a7839527c6e). Exterior e interior proceden del mismo GLB (19 MB), cargado al seleccionar el M2. Conserva las texturas originales del habitáculo, pantallas, cuero y detalles; pintura, acabado de llantas y tapicería se ajustan en ejecución. El despiece agrupa las piezas por ensamblajes del autor.

La ficha ilustra el G87 de 2023: 460 CV, propulsión trasera y 4,1 s con cambio automático, según [BMW PressClub](https://www.press.bmwgroup.com/global/article/detail/T0404444EN/the-all-new-bmw-m2). El precio base de 96.900 € es ficticio. El recurso artístico incluye modificaciones mecánicas y no reproduce una especificación OEM exacta.

## E92 y E36 Street

Se añaden dos coches completos de Black Snow bajo CC BY 4.0, con su propio exterior e interior:
[M3 E92 stance](https://sketchfab.com/3d-models/bmw-m3-e92-stance-c35a14d811b042d792a6da69381f7f80) y
[E36 Street](https://sketchfab.com/3d-models/bmw-3-series-e36-street-13d0a12ecda04317b96ce1e618300412).
Se cargan al seleccionarlos (4,0 y 6,8 MB), con Meshopt servido desde Three.js, sin dependencias remotas.
El adaptador conserva los atlas del habitáculo y separa los grupos del autor para el despiece manual.
Los atributos cuantizados se convierten a flotantes antes de aplicar las transformaciones comunes:
modificar directamente posiciones enteras normalizadas deformaría las mallas.

Ambas son preparaciones modificadas, con suspensión rebajada. El E92 conserva asientos y jaula
inspirados en el GTS; su ficha utiliza como referencia el M3 Coupé manual de 2007 (420 CV / 4,8 s),
[fuente BMW](https://www.press.bmwgroup.com/global/article/attachment/T0137039EN/208331).
El E36 se identifica como E36 Street, sin atribuirle una variante de motor no verificada: potencia y
aceleración se muestran como N/D. Los precios base de 58.000 € y 28.000 € son ficticios de demostración.
Créditos, origen de las copias optimizadas y cambios: [atribución](frontend/public/models/ATTRIBUTION.md).
