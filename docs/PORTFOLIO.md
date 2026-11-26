# BMW Atelier · Presentación para portfolio

## Título

**BMW Atelier — Configurador 3D de vehículos**

## Descripción breve

Showroom interactivo desarrollado con Angular, Three.js y Spring Boot. Permite explorar seis BMW en 360°, acceder al interior y personalizar sus acabados. Incluye escenarios de día y noche y un flujo de pedido de demostración mediante QR con confirmación por correo.

## Descripción del proyecto

BMW Atelier es una aplicación full stack que transforma la selección de un vehículo en una experiencia interactiva. El usuario puede explorar un catálogo de seis modelos BMW, girar cada coche en 360°, entrar en el habitáculo y configurar la pintura, las llantas y la tapicería en tiempo real. La experiencia se completa con iluminación de día y noche, una vista de despiece animada y fichas técnicas por modelo.

El proyecto conecta una interfaz Angular con un visor Three.js y una API REST desarrollada con Spring Boot y Java. El backend valida las opciones, calcula los presupuestos y registra pedidos de demostración mediante un formulario accesible por QR, con validación de mayoría de edad y confirmación por correo. La implementación presta especial atención al rendimiento 3D, al diseño adaptable y a la coherencia de los datos entre cliente y servidor.

## Mi aportación

- Diseño e implementación de la interfaz, la página de inicio y la navegación adaptable.
- Integración de modelos 3D de terceros y desarrollo del configurador de materiales, las cámaras, los escenarios y el despiece visual.
- Optimización del visor con carga y renderizado bajo demanda, agrupación de geometrías y resolución adaptativa.
- Desarrollo de la API REST, la persistencia de configuraciones y pedidos y la validación de precios en el servidor.
- Implementación del flujo de QR, el formulario móvil y las confirmaciones SMTP con reintentos.
- Automatización de comprobaciones del frontend y del backend mediante GitHub Actions y preparación del empaquetado Docker.

## Retos técnicos

**Mantener la fluidez del 3D.** Los modelos tienen geometrías y materiales complejos. El visor reduce el trabajo en reposo, agrupa geometrías compatibles y adapta la resolución durante la interacción.

**Conservar la coherencia visual.** Los modelos proceden de distintos autores. Sus adaptadores normalizan escala y orientación, mantienen el encaje del habitáculo y permiten modificar acabados respetando los detalles originales.

**Dar continuidad al pedido entre dispositivos.** Un QR enlaza la configuración del ordenador con un formulario móvil. El backend conserva el precio y los acabados, controla la caducidad y evita duplicar pedidos ante reintentos o solicitudes simultáneas.

## Tecnologías

Angular · TypeScript · Three.js · WebGL · Java 21 · Spring Boot · API REST · Spring Data JPA · H2 · SMTP / Brevo · Docker · GitHub Actions

## Datos para la ficha del portfolio

| Campo | Contenido |
| --- | --- |
| Tipo | Proyecto personal · Aplicación full stack |
| Rol | Desarrollo full stack e integración 3D |
| Estado | V1 funcional en local; despliegue público pendiente |
| Repositorio | https://github.com/gabrielsuarezdevv/concesionario-bmw |
| Rama de la V1 | `feat/bmw-atelier` |
| Imagen de portada | `docs/images/inicio.jpg` |
| Acción disponible | Ver código |

Hasta que exista una URL pública, presenta el proyecto con el enlace al código y las capturas. El despliegue en Railway está previsto y todavía no se ha realizado.

## Descripción corta para GitHub

Showroom BMW con Angular, Three.js y Spring Boot: configuración 3D en tiempo real, vistas exterior e interior, escenarios día/noche y pedidos de demostración mediante QR con confirmación por email.

## Contexto del proyecto

Proyecto independiente, sin afiliación con BMW AG. Los modelos 3D son recursos de terceros con sus créditos y licencias conservados en el repositorio. Los precios y pedidos son de demostración y no se realizan cobros. La aplicación no se presenta como un concesionario oficial ni como un servicio comercial operativo.
