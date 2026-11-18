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

- BMW M4 Competition y BMW 330i E46 con archivos GLB independientes, rotación 360° con ratón, gestos o flechas; zoom con rueda o +/−. El E46 se descarga cuando se selecciona por primera vez (unos 35 MB para el coche completo).
- Iluminación de estudio generada localmente, pintura con barniz y microtextura, cristales con transmisión física y sombras de contacto proyectadas desde la geometría. Se conservan las texturas originales de carbono, neumáticos y detalles de las ruedas. El realismo sigue limitado por la malla y las texturas del modelo de origen.
- Cámara interior desde el puesto del conductor.
- Habitáculo con vinilo no metálico, mapas de detalle de cuero CC0 de Poly Haven y oclusión ambiental de corto alcance, calculada solo en la vista interior. Los cristales no participan como superficies opacas en ese cálculo. El color de tapicería usa una máscara espacial aproximada porque el GLB comparte materiales entre asientos y molduras.
- Despiece animado por grupos visuales: carrocería, acristalamiento, habitáculo y cuatro ruedas. Se activa manualmente desde sus controles; cambiar pintura, llantas o tapicería conserva la vista elegida.
- Cinco pinturas, dos acabados de llantas y tres colores de tapicería. Los cambios son de materiales; no sustituyen geometría por piezas OEM.
- Catálogo de dos modelos: M4 Competition y 330i E46. M2 e i4 retirados del selector y de los presupuestos del servidor. Las configuraciones antiguas con modelos retirados vuelven al M4 al abrir la web. Las fichas, precios y opciones son de demostración; los acabados no representan un catálogo de fábrica del E46.
- Resumen, guardado en Spring Boot/H2, restauración local, enlaces de configuración y descarga JSON.
- Si el servidor no está disponible, la interfaz lo indica y permite guardar exclusivamente en el navegador. El presupuesto del servidor nunca acepta un total enviado por el cliente.
- Navegación por teclado, diálogos nativos, avisos accesibles y respeto por movimiento reducido.

## Validar

```powershell
cd frontend
npm run build
```

```powershell
cd backend
.\mvnw.cmd verify
```

Las pruebas de integración verifican precios calculados en el servidor, opciones inválidas, validación de entradas y creación/recuperación de configuraciones. GitHub Actions compila Angular y ejecuta `verify` de Maven en cada PR y push a `main` o `feat/**`.

## API

| Método | Ruta | Resultado |
|---|---|---|
| GET | `/api/health` | Estado del servicio |
| GET | `/api/catalog` | Modelos y opciones de demostración |
| POST | `/api/quotes` | Presupuesto validado y calculado |
| POST | `/api/configurations` | Guarda y devuelve UUID y precio |
| GET | `/api/configurations/{uuid}` | Recupera una configuración |

Ejemplo de entrada para ambos POST:

```json
{"model":"m4","paint":"green","wheels":"forged","interior":"cognac"}
```

El resultado orientativo para este ejemplo es 130.600 EUR. Opciones desconocidas o incompletas devuelven 400; una configuración inexistente devuelve 404. Los registros H2 se guardan en `backend/data/` (ignorado por Git). No se recogen datos personales. Los UUID permiten recuperar configuraciones por enlace conocido; no hay cuentas ni listado público de registros.

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
