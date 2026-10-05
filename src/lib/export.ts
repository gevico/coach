import { getFontEmbedCSS, toPng, toSvg } from 'html-to-image';
import { jsPDF } from 'jspdf';

export type CanvasExportFormat = 'pdf' | 'svg';

function fileName(title: string, extension: string): string {
  const name = title.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').trim();
  return `${name.slice(0, 120) || 'Markdown 画布'}.${extension}`;
}

function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function blobDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('无法读取图片内容。'));
      }
    });
    reader.addEventListener('error', () => reject(new Error('无法读取图片内容。')));
    reader.readAsDataURL(blob);
  });
}

async function waitForImages(node: HTMLElement): Promise<void> {
  await Promise.all(
    Array.from(node.querySelectorAll('img')).map(async (image) => {
      try {
        if (image.loading === 'lazy' && !image.complete) {
          const preload = new Image();
          preload.src = image.currentSrc || image.src;
          await preload.decode();
        }
        await image.decode();
      } catch {
        throw new Error(`图片加载失败，无法导出：${image.getAttribute('src') || image.alt}`);
      }
    }),
  );
}

async function embedImages(node: HTMLElement): Promise<void> {
  const resources = new Map<string, Promise<string>>();

  await Promise.all(
    Array.from(node.querySelectorAll('img')).map(async (image) => {
      const source = image.currentSrc || image.src;
      image.removeAttribute('srcset');
      image.removeAttribute('sizes');
      image.loading = 'eager';

      if (source.startsWith('data:')) {
        image.src = source;
        return;
      }

      let resource = resources.get(source);
      if (!resource) {
        resource = fetch(source).then(async (response) => {
          if (!response.ok) {
            throw new Error(`图片请求失败（${response.status}）：${source}`);
          }
          return blobDataUrl(await response.blob());
        });
        resources.set(source, resource);
      }

      try {
        image.src = await resource;
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`无法嵌入图片，请确认图片地址允许网页访问：${detail}`);
      }
    }),
  );

  await waitForImages(node);
}

function copyComputedStyles(source: HTMLElement, clone: HTMLElement): void {
  const sourceElements = [source, ...source.querySelectorAll('*')];
  const cloneElements = [clone, ...clone.querySelectorAll('*')];

  sourceElements.forEach((element, index) => {
    const target = cloneElements[index];
    if (!(target instanceof HTMLElement || target instanceof SVGElement)) return;

    const computed = window.getComputedStyle(element);
    for (let propertyIndex = 0; propertyIndex < computed.length; propertyIndex += 1) {
      const property = computed.item(propertyIndex);
      target.style.setProperty(property, computed.getPropertyValue(property));
    }
    target.style.setProperty('animation', 'none', 'important');
    target.style.setProperty('transition', 'none', 'important');

    if (element.hasAttribute('data-reveal')) {
      target.style.setProperty('opacity', '1', 'important');
      target.style.setProperty('visibility', 'visible', 'important');
      target.style.setProperty('filter', 'none', 'important');
      target.style.setProperty('transform', 'none', 'important');
      target.style.setProperty('clip-path', 'none', 'important');
    }
    if (element.getAttribute('data-reading-current') === 'true') {
      target.style.setProperty('background-color', 'transparent', 'important');
      target.style.setProperty('box-shadow', 'none', 'important');
    }
  });
}

function freezeSVGStyles(node: HTMLElement): void {
  for (const element of node.querySelectorAll('svg, svg *')) {
    if (!(element instanceof SVGElement)) continue;
    const computed = window.getComputedStyle(element);
    const properties = Array.from(computed).map((property) => [property, computed.getPropertyValue(property)]);
    for (const [property, value] of properties) {
      element.style.setProperty(property, value);
    }
  }
}

async function loadedFontCSS(node: HTMLElement): Promise<string> {
  const normalized = (value: string) => value.replace(/["'\s]/g, '').toUpperCase();
  const loadedFaces = Array.from(document.fonts).filter((face) => face.status === 'loaded');
  const fontRules: string[] = [];

  function collectRules(rules: CSSRuleList): void {
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSFontFaceRule) {
        const family = normalized(rule.style.getPropertyValue('font-family'));
        const range = normalized(rule.style.getPropertyValue('unicode-range') || 'U+0-10FFFF');
        if (loadedFaces.some((face) => normalized(face.family) === family && normalized(face.unicodeRange) === range)) {
          fontRules.push(rule.cssText);
        }
      } else if (rule instanceof CSSGroupingRule) {
        collectRules(rule.cssRules);
      }
    }
  }

  for (const sheet of Array.from(document.styleSheets)) {
    try {
      collectRules(sheet.cssRules);
    } catch {
      throw new Error('无法读取字体样式，请确认字体样式可以从当前网站访问。');
    }
  }

  const fontDocument = document.implementation.createHTMLDocument('Canvas fonts');
  const style = fontDocument.createElement('style');
  style.textContent = fontRules.join('\n');
  fontDocument.head.append(style);
  const fontNode = fontDocument.importNode(node, true);
  fontDocument.body.append(fontNode);
  return getFontEmbedCSS(fontNode);
}

export async function exportCanvas(
  node: HTMLElement,
  format: CanvasExportFormat,
  title: string,
): Promise<void> {
  await document.fonts.ready;
  await waitForImages(node);

  const width = Math.ceil(Math.max(node.offsetWidth, node.scrollWidth));
  const height = Math.ceil(Math.max(node.offsetHeight, node.scrollHeight));
  if (width === 0 || height === 0) {
    throw new Error('画布没有可导出的内容。');
  }

  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = 'position:fixed;left:-100000px;top:0;pointer-events:none;';
  const clone = node.cloneNode(true) as HTMLElement;
  copyComputedStyles(node, clone);
  clone.dataset.export = 'true';
  clone.style.setProperty('transform', 'none', 'important');
  clone.style.setProperty('position', 'relative', 'important');
  clone.style.setProperty('width', `${width}px`, 'important');
  clone.style.setProperty('height', `${height}px`, 'important');
  clone.style.setProperty('max-width', 'none', 'important');
  clone.style.setProperty('max-height', 'none', 'important');
  clone.style.setProperty('margin', '0', 'important');
  clone.style.setProperty('overflow', 'visible', 'important');

  const finalState = document.createElement('style');
  finalState.textContent = `
    [data-export="true"] *,
    [data-export="true"] *::before,
    [data-export="true"] *::after {
      animation: none !important;
      transition: none !important;
    }
    [data-export="true"] [data-reveal]::before,
    [data-export="true"] [data-reveal]::after {
      opacity: 1 !important;
      visibility: visible !important;
      transform: none !important;
      clip-path: none !important;
    }
    [data-export="true"] .circle-decoration ellipse {
      stroke-dasharray: none !important;
      stroke-dashoffset: 0 !important;
    }
  `;
  host.append(finalState, clone);
  document.body.append(host);

  try {
    freezeSVGStyles(clone);
    await embedImages(clone);
    const fontEmbedCSS = await loadedFontCSS(clone);
    const options = {
      width,
      height,
      backgroundColor: '#fcfcfc',
      fontEmbedCSS,
      includeQueryParams: true,
    };

    if (format === 'svg') {
      const url = await toSvg(clone, options);
      const response = await fetch(url);
      downloadBlob(await response.blob(), fileName(title, 'svg'));
      return;
    }

    const image = await toPng(clone, { ...options, pixelRatio: 2 });
    const pageScale = Math.min(1, 18_000 / Math.max(width, height));
    const pageWidth = width * pageScale;
    const pageHeight = height * pageScale;
    const pdf = new jsPDF({
      orientation: width >= height ? 'landscape' : 'portrait',
      unit: 'px',
      format: [pageWidth, pageHeight],
      hotfixes: ['px_scaling'],
      compress: true,
    });
    pdf.setProperties({ title, creator: 'Markdown Canvas' });
    pdf.addImage(image, 'PNG', 0, 0, pageWidth, pageHeight, undefined, 'FAST');
    downloadBlob(pdf.output('blob'), fileName(title, 'pdf'));
  } finally {
    host.remove();
  }
}

export function downloadMarkdown(source: string, title: string): void {
  downloadBlob(
    new Blob([source], { type: 'text/markdown;charset=utf-8' }),
    fileName(title, 'md'),
  );
}
