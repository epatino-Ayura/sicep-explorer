# SICEP Explorer — Convocatorias y productos de energía (XM)

Aplicación web que consolida y permite explorar la información **pública** de las
**convocatorias de compra de energía** del sistema [SICEP de XM](https://sicep.xm.com.co/)
(Mercado de Energía Mayorista, Colombia).

## 🔗 Aplicación en vivo

### 👉 https://epatino-ayura.github.io/sicep-explorer/

## ¿Qué muestra?

Cobertura: **2020–2026**, ~639 convocatorias y ~2.200 productos.

- **Buscador de productos** — una fila por producto de cada convocatoria, con filtros por año,
  estado, agente comprador, mercado y "solo adjudicados". Columnas:
  - Energía **demandada** y **adjudicada** (GWh)
  - **Precio** promedio adjudicado ($/kWh)
  - **Plazo del contrato** (años y período de obligación)
  - Tipo de contrato y número de ofertas recibidas / adjudicadas
- **Ficha por convocatoria** — resumen (comprador, mercado, FNCER, suministro), tabla de
  productos y enlaces a los archivos del pliego en el expediente oficial.
- **Dashboard** — energía demandada vs adjudicada por año, precio promedio por año,
  distribución de plazos y compradores por energía adjudicada.

## Fuente y actualización

- Datos extraídos de las vistas **públicas** de `sicep.xm.com.co` (convocatorias abiertas,
  cerradas y adjudicadas, desiertas y canceladas).
- El sitio se **actualiza automáticamente cada 6 horas**.
- La **curva horaria** detallada de cada producto vive en el anexo de *energía y precios* del
  pliego; desde la ficha se abre el **expediente oficial de SICEP** para descargarla.

## Alcance / notas

- Solo información **pública**: SICEP no publica el **nombre del vendedor adjudicado**; sí publica
  cuántas ofertas se adjudicaron, la energía y el precio (el comprador siempre aparece).
- Las convocatorias recién abiertas muestran su demanda en la etapa de **consulta**.
- Los archivos del pliego (PDF/Excel) se descargan desde el sistema oficial de SICEP, no se
  alojan en este sitio.

## Cómo está hecho

Sitio **estático** (HTML + JavaScript, sin backend): los datos se sirven como JSON en `data/`
y todo el filtrado, la ficha y las gráficas se calculan en el navegador. Gráficas con
[Chart.js](https://www.chartjs.org/). Hospedado gratis en **GitHub Pages**.

```
web/
├── index.html        Buscador de productos
├── ficha.html        Ficha de una convocatoria (?c=<codigo>)
├── dashboard.html    Indicadores
└── data/*.json       Datos (convocatorias, productos, resumen)
```

---

*Datos públicos de XM · Este sitio no es un servicio oficial de XM.*
