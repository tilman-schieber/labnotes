type MathJaxConfig = {
  tex?: Record<string, unknown>;
  loader?: Record<string, unknown>;
  svg?: Record<string, unknown>;
  options?: Record<string, unknown>;
  startup?: {
    promise?: Promise<void>;
  };
  typesetPromise?: (elements?: HTMLElement[]) => Promise<void>;
  tex2svgPromise?: (latex: string, options?: { display?: boolean }) => Promise<HTMLElement>;
};

declare global {
  interface Window {
    MathJax?: MathJaxConfig;
  }
}

let isLoading = false;
let loadPromise: Promise<void> | null = null;

const MATHJAX_SRC = 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js';

function sanitizeLatexForRender(raw: string): string {
  let value = raw.trim();
  while (value.length >= 2 && value.startsWith('$') && value.endsWith('$')) {
    value = value.slice(1, -1).trim();
  }
  if (value.startsWith('\\(') && value.endsWith('\\)') && value.length >= 4) {
    value = value.slice(2, -2).trim();
  }
  if (value.startsWith('\\[') && value.endsWith('\\]') && value.length >= 4) {
    value = value.slice(2, -2).trim();
  }
  return value;
}

function ensureMathJaxLoaded(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.resolve();
  }

  if (window.MathJax?.typesetPromise) {
    return Promise.resolve();
  }

  if (isLoading && loadPromise) {
    return loadPromise;
  }

  isLoading = true;
  window.MathJax = {
    tex: {
      packages: { '[+]': ['mhchem'] }
    },
    loader: {
      load: ['[tex]/mhchem']
    },
    svg: {
      fontCache: 'global'
    },
    options: {
      skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code']
    }
  };

  loadPromise = new Promise<void>((resolve) => {
    const script = document.createElement('script');
    script.src = MATHJAX_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => resolve();
    document.head.appendChild(script);
  });

  return loadPromise;
}

export async function renderMathIntoElement(
  element: HTMLElement,
  latex: string,
  displayMode: boolean
): Promise<void> {
  const content = sanitizeLatexForRender(latex);
  if (!content) {
    element.textContent = 'empty formula';
    return;
  }

  element.setAttribute('data-latex', content);
  element.setAttribute('data-display', displayMode ? 'true' : 'false');

  await ensureMathJaxLoaded();
  const mathJax = window.MathJax;

  if (!mathJax?.tex2svgPromise) {
    element.textContent = content;
    return;
  }

  try {
    if (mathJax.startup?.promise) {
      await mathJax.startup.promise;
    }

    const rendered = await mathJax.tex2svgPromise(content, { display: displayMode });
    element.replaceChildren(rendered);
  } catch {
    element.textContent = content;
  }
}
