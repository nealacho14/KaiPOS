import type {
  Allergen,
  Branch,
  Business,
  Category,
  DietaryTag,
  ModifierGroup,
  Product,
  ProductAvailability,
  ProductPreference,
  ProductVariant,
} from '@kaipos/shared';
import type { CreateProductInput } from '@kaipos/shared/schemas/products';

// ---------------------------------------------------------------------------
// Mura — real menu of the café, as a pure data module.
//
// Consumed by `src/db/seed.ts` (local + Atlas) and by
// `scripts/export-mura-fixture.ts` (JSON fixture handed to the external app
// "Ferna"). It must stay free of DB / logger imports so it can be evaluated
// anywhere. Product descriptions are verbatim from `mura_menu.docx`.
//
// `product.sku` doubles as the public slug consumed by Ferna — kebab-case and
// stable. Modifier group / option ids are a public contract as well.
// ---------------------------------------------------------------------------

// All seed _id values are UUID v4 shaped to match production (services mint
// ids with `crypto.randomUUID()`) and to satisfy the `z.string().uuid()`
// validators on API route params. The fixed pattern
// `00000000-0000-4000-8000-NNNNNNNNNNNN` keeps them stable and debuggable.
const ID_PREFIX = '00000000-0000-4000-8000-';

export const MURA_SLUG = 'mura';
export const MURA_BUSINESS_ID = `${ID_PREFIX}000000001000`;
export const MURA_BRANCH_ID = `${ID_PREFIX}000000001100`;
export const MURA_ADMIN_USER_ID = `${ID_PREFIX}000000001301`;
export const MURA_KELVIN_USER_ID = `${ID_PREFIX}000000001302`;
export const MURA_ADMIN_EMAIL = 'admin@mura.co';
export const MURA_CARRY_OVER_EMAIL = 'kelvin.hernandezc30@gmail.com';

// Real AssetsCdnDomain of the prod AssetsStack. Override with
// `MURA_IMAGE_BASE_URL` (e.g. MinIO in Docker).
export const DEFAULT_MURA_IMAGE_BASE_URL = 'https://d6tpeu874uebt.cloudfront.net';
// Uploaded once by the operator from
// `src/db/seed-data/assets/product-placeholder.webp`; the seed never touches S3.
export const MURA_PLACEHOLDER_IMAGE_PATH = `products/${MURA_BRANCH_ID}/placeholder.webp`;

export function muraPlaceholderImageUrl(imageBaseUrl: string): string {
  return `${imageBaseUrl.replace(/\/+$/, '')}/${MURA_PLACEHOLDER_IMAGE_PATH}`;
}

export const MURA_BUSINESS = {
  _id: MURA_BUSINESS_ID,
  name: 'Mura',
  slug: MURA_SLUG,
  // Contact data as published in the Ferna app footer (Mura has no public email).
  address: 'Parque Fernández de Madrid 37-34, Cartagena, Colombia',
  phone: '+57 318 121 7576',
  currency: 'COP',
} as const;

export const MURA_BRANCH = {
  _id: MURA_BRANCH_ID,
  businessId: MURA_BUSINESS_ID,
  name: 'Alianza Colombo-Francesa',
  address: 'Parque Fernández de Madrid 37-34, Cartagena, Colombia',
  phone: '+57 318 121 7576',
  timezone: 'America/Bogota',
} as const;

// ---------------------------------------------------------------------------
// Categories (menu order; sortOrder 1..13)
// ---------------------------------------------------------------------------

export interface MuraCategorySeed {
  _id: string;
  name: string;
  description: string;
  sortOrder: number;
}

const categoryId = (n: number): string => `${ID_PREFIX}0000000020${String(n).padStart(2, '0')}`;

export const MURA_CATEGORIES: readonly MuraCategorySeed[] = [
  {
    _id: categoryId(1),
    name: 'Filtrados',
    description:
      'Si quieres conocer realmente el café, los filtrados son una muy buena forma de empezar. Métodos como V60, Chemex o prensa francesa nos ayudan a resaltar sus aromas, sabores y notas más delicadas.',
    sortOrder: 1,
  },
  {
    _id: categoryId(2),
    name: 'Café',
    description:
      'Nuestras bebidas con leche se preparan con leche deslactosada. Si prefieres otra opción, también tenemos leche de almendra o avena 🌱.',
    sortOrder: 2,
  },
  {
    _id: categoryId(3),
    name: 'Ice',
    description: 'Nuestras bebidas de espresso en versión fría 🧊.',
    sortOrder: 3,
  },
  {
    _id: categoryId(4),
    name: 'Cold Brew',
    description: 'Café preparado en frío durante varias horas. Queda suave, fresco y bien redondo.',
    sortOrder: 4,
  },
  {
    _id: categoryId(5),
    name: 'Frappé',
    description: 'Bebidas frías, cremosas y refrescantes con espresso doble 🥤.',
    sortOrder: 5,
  },
  {
    _id: categoryId(6),
    name: 'Tés',
    description: 'Chai, matcha e infusiones 🍵.',
    sortOrder: 6,
  },
  {
    _id: categoryId(7),
    name: 'Jugos',
    description: 'Jugos naturales y limonadas 🍊.',
    sortOrder: 7,
  },
  {
    _id: categoryId(8),
    name: 'Fizz',
    description: 'Bebidas frescas, florales y aromáticas ✨.',
    sortOrder: 8,
  },
  {
    _id: categoryId(9),
    name: 'Otros',
    description: 'Agua y gaseosas 🥤.',
    sortOrder: 9,
  },
  {
    _id: categoryId(10),
    name: 'Cervezas',
    description:
      'Cervezas y vino 🍺. Prohíbese el expendio de bebidas embriagantes a menores de edad. El exceso de alcohol es perjudicial para la salud.',
    sortOrder: 10,
  },
  {
    _id: categoryId(11),
    name: 'Desayunos',
    description: 'Para empezar el día 🍳.',
    sortOrder: 11,
  },
  {
    _id: categoryId(12),
    name: 'Bowls',
    description: 'Bowls completos y llenos de sabor 🥣.',
    sortOrder: 12,
  },
  {
    _id: categoryId(13),
    name: 'All Day',
    description:
      'Todos nuestros panes son preparados con masa madre 🥖. Así que puedes venir por uno de estos a cualquier hora del día.',
    sortOrder: 13,
  },
];

// ---------------------------------------------------------------------------
// Modifier group builders. Ids are a public contract (Ferna) — keep them.
// Each call returns a fresh object so products never share references.
// ---------------------------------------------------------------------------

export function methodGroup(): ModifierGroup {
  return {
    id: 'metodo',
    name: 'Método',
    required: true,
    maxSelectable: 1,
    options: [
      { id: 'v60', label: 'V60', priceDelta: 0 },
      { id: 'chemex', label: 'Chemex', priceDelta: 0 },
      { id: 'prensa-francesa', label: 'Prensa francesa', priceDelta: 0 },
    ],
  };
}

export function milkGroup(): ModifierGroup {
  return {
    id: 'leche',
    name: 'Leche',
    required: true,
    maxSelectable: 1,
    options: [
      { id: 'leche-deslactosada', label: 'Deslactosada', priceDelta: 0 },
      { id: 'leche-almendra', label: 'Leche de almendra', priceDelta: 5000 },
      { id: 'leche-avena', label: 'Leche de avena', priceDelta: 5000 },
    ],
  };
}

export function syrupGroup(): ModifierGroup {
  return {
    id: 'extras',
    name: 'Extras',
    required: false,
    maxSelectable: 3,
    options: [
      { id: 'vainilla', label: 'Vainilla', priceDelta: 6000 },
      { id: 'caramelo', label: 'Caramelo', priceDelta: 6000 },
      { id: 'amaretto', label: 'Amaretto', priceDelta: 6000 },
      { id: 'avellana', label: 'Avellana', priceDelta: 6000 },
      { id: 'leche-condensada', label: 'Leche condensada', priceDelta: 4000 },
      { id: 'syrup-corozo', label: 'Syrup de corozo', priceDelta: 4000 },
      { id: 'syrup-tamarindo', label: 'Syrup de tamarindo', priceDelta: 4000 },
      { id: 'syrup-lulo', label: 'Syrup de lulo', priceDelta: 4000 },
    ],
  };
}

export function micheladaGroup(): ModifierGroup {
  return {
    id: 'michelada',
    name: 'Adiciones',
    required: false,
    maxSelectable: 1,
    options: [{ id: 'michelada', label: 'Michelada', priceDelta: 3000 }],
  };
}

export function foodExtrasGroup(): ModifierGroup {
  return {
    id: 'adiciones-comida',
    name: 'Adiciones',
    required: false,
    maxSelectable: 6,
    options: [
      { id: 'huevos', label: 'Huevos', priceDelta: 6000 },
      { id: 'queso', label: 'Queso', priceDelta: 6000 },
      { id: 'tocineta', label: 'Tocineta', priceDelta: 6000 },
      { id: 'pulled-pork', label: 'Pulled Pork', priceDelta: 9000 },
      { id: 'carne-angus', label: 'Carne Angus', priceDelta: 12000 },
      { id: 'pollo-apanado', label: 'Pollo apanado', priceDelta: 9000 },
    ],
  };
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

export type MuraProductSeed = Omit<CreateProductInput, 'branchId'> & {
  _id: string;
  featured?: boolean;
};

const ONLINE: ProductAvailability = { pos: true, online: true, kiosk: false };
// Alcohol is sold on-site only.
const POS_ONLY: ProductAvailability = { pos: true, online: false, kiosk: false };

const milkAndSyrups = (): ModifierGroup[] => [milkGroup(), syrupGroup()];
const syrupsOnly = (): ModifierGroup[] => [syrupGroup()];
const foodExtras = (): ModifierGroup[] => [foodExtrasGroup()];

function filtradoVariants(sku: string, twoCups: number, threeCups: number): ProductVariant[] {
  return [
    { id: '1-taza', name: '1 taza', sku: `${sku}-1-taza`, priceDelta: 0 },
    { id: '2-tazas', name: '2 tazas', sku: `${sku}-2-tazas`, priceDelta: twoCups },
    { id: '3-tazas', name: '3 tazas', sku: `${sku}-3-tazas`, priceDelta: threeCups },
  ];
}

// Compact per-product spec; `defineProducts` expands it into a fully
// explicit `MuraProductSeed` (no Zod defaults relied upon).
interface ProductSpec {
  sku: string;
  name: string;
  price: number;
  description: string;
  featured?: boolean;
  allergens?: Allergen[];
  dietaryTags?: DietaryTag[];
  modifierGroups?: () => ModifierGroup[];
  variants?: ProductVariant[];
  availability?: ProductAvailability;
}

const MENU: ReadonlyArray<readonly [category: string, specs: readonly ProductSpec[]]> = [
  [
    'Filtrados',
    [
      {
        sku: 'filtrado-lavado',
        name: 'Filtrado Lavado',
        price: 12000,
        description:
          'El lavado suele ser de los más limpios y brillantes ☕. Retiramos la fruta antes de secar el café, y eso ayuda a que se sientan más claras y definidas sus notas.',
        featured: true,
        dietaryTags: ['vegan'],
        modifierGroups: () => [methodGroup()],
        variants: filtradoVariants('filtrado-lavado', 8000, 18000),
      },
      {
        sku: 'filtrado-honey',
        name: 'Filtrado Honey',
        price: 15000,
        description:
          'El honey busca un buen equilibrio 🍯. Dejamos parte de la fruta alrededor del grano mientras se seca, y eso suele darle más dulzor y una textura bien agradable.',
        dietaryTags: ['vegan'],
        modifierGroups: () => [methodGroup()],
        variants: filtradoVariants('filtrado-honey', 11000, 23000),
      },
      {
        sku: 'filtrado-natural',
        name: 'Filtrado Natural',
        price: 16000,
        description:
          'El natural es de los más frutales 🍒. Secamos el café con la fruta completa, y eso suele darle mucho dulzor y notas de fruta.',
        dietaryTags: ['vegan'],
        modifierGroups: () => [methodGroup()],
        variants: filtradoVariants('filtrado-natural', 13000, 23000),
      },
    ],
  ],
  [
    'Café',
    [
      {
        sku: 'espresso',
        name: 'Espresso',
        price: 8000,
        description:
          'El espresso es pequeño, pero tiene mucho carácter ☕. Es concentrado e intenso, perfecto para sentir todo lo que tiene el café.',
        dietaryTags: ['vegan'],
        modifierGroups: syrupsOnly,
      },
      {
        sku: 'americano',
        name: 'Americano',
        price: 9000,
        description:
          'Si quieres disfrutar el espresso de una forma más suave, el americano es para ti ☕. Lo alargamos con agua y queda una taza más ligera, pero llena de sabor.',
        dietaryTags: ['vegan'],
        modifierGroups: syrupsOnly,
      },
      {
        sku: 'macchiato',
        name: 'Macchiato',
        price: 9000,
        description:
          'El macchiato es un espresso con un pequeño toque de leche 🤍. Mantiene toda la intensidad del café, pero con una textura un poquito más suave.',
        allergens: ['dairy'],
        modifierGroups: milkAndSyrups,
      },
      {
        sku: 'cappuccino',
        name: 'Cappuccino',
        price: 12000,
        description:
          'El cappuccino es bien cremoso ☁️. Lleva espresso, leche texturizada y una buena capa de espuma, buscando ese equilibrio rico entre café y leche.',
        allergens: ['dairy'],
        modifierGroups: milkAndSyrups,
      },
      {
        sku: 'carpaccio',
        name: 'Carpaccio',
        price: 14000,
        description:
          'Una opción diferente y especial de la casa ✨. Ideal si quieres probar algo fuera de lo tradicional. Cappuccino de pistachio.',
        allergens: ['dairy', 'tree-nut'],
        modifierGroups: milkAndSyrups,
      },
      {
        sku: 'mocaccino',
        name: 'Mocaccino',
        price: 13000,
        description:
          'El mocaccino es para los que disfrutan el café con un toque de chocolate 🍫. Espresso, chocolate y leche se juntan en una taza cremosa y golosa.',
        allergens: ['dairy'],
        modifierGroups: milkAndSyrups,
      },
      {
        sku: 'latte',
        name: 'Latte',
        price: 12000,
        description:
          'El latte es de los más suaves y cremosos 🤎. Lleva espresso con más leche texturizada, así que el café se siente más delicado y fácil de tomar.',
        allergens: ['dairy'],
        modifierGroups: milkAndSyrups,
      },
      {
        sku: 'flat-white',
        name: 'Flat White',
        price: 12500,
        description:
          'El flat white es cremoso, pero deja que el café sea protagonista ☕. Lleva espresso y leche bien texturizada, con una capa fina de microespuma.',
        featured: true,
        allergens: ['dairy'],
        modifierGroups: milkAndSyrups,
      },
      {
        sku: 'chocolate',
        name: 'Chocolate',
        price: 12000,
        description:
          'El chocolate es cremoso, dulce y reconfortante 🍫. Perfecto si quieres algo calientito y sin café.',
        allergens: ['dairy'],
        modifierGroups: milkAndSyrups,
      },
      {
        sku: 'affogato',
        name: 'Affogato',
        price: 18000,
        description:
          'El affogato es un pequeño capricho 🍨. Helado de vainilla, espresso y crema de pistacho; el contraste entre frío, caliente, dulce e intenso es increíble.',
        allergens: ['dairy', 'tree-nut'],
        modifierGroups: milkAndSyrups,
      },
    ],
  ],
  [
    'Ice',
    [
      {
        sku: 'ice-latte',
        name: 'Ice Latte',
        price: 14000,
        description:
          'El latte frío es suave, cremoso y refrescante 🧊. Una forma más fresca de disfrutar nuestro espresso con leche.',
        allergens: ['dairy'],
        modifierGroups: milkAndSyrups,
      },
      {
        sku: 'ice-cappuccino',
        name: 'Ice Cappuccino',
        price: 14000,
        description:
          'Un cappuccino en versión fría 🧊. Cremoso, refrescante y con ese sabor de café que sigue siendo protagonista.',
        allergens: ['dairy'],
        modifierGroups: milkAndSyrups,
      },
      {
        sku: 'vietnamese',
        name: 'Vietnamese',
        price: 16000,
        description:
          'El Vietnamese es dulce, intenso y bien refrescante 🧊. Combinamos espresso, lecherita y leche para una bebida cremosa con mucho carácter.',
        allergens: ['dairy'],
        modifierGroups: milkAndSyrups,
      },
      {
        sku: 'ice-mocaccino',
        name: 'Ice Mocaccino',
        price: 15000,
        description:
          'El mocaccino frío es para los amantes del café y el chocolate 🍫. Cremoso, dulce y perfecto para esos días de calor.',
        allergens: ['dairy'],
        modifierGroups: milkAndSyrups,
      },
    ],
  ],
  [
    'Cold Brew',
    [
      {
        sku: 'cold-brew',
        name: 'Cold Brew Natural',
        price: 14000,
        description:
          'El cold brew natural es suave y refrescante 🧊. Lo preparamos en frío para tener una taza más redonda, delicada y fácil de tomar.',
        dietaryTags: ['vegan'],
        modifierGroups: syrupsOnly,
      },
      {
        sku: 'lupin',
        name: 'Lupin',
        price: 19000,
        description:
          'Lupin es fresco, dulce y tropical 🌺. Nuestro cold brew se encuentra con un syrup de corozo para darle un toque frutal muy especial.',
        dietaryTags: ['vegan'],
        modifierGroups: syrupsOnly,
      },
      {
        sku: 'tropico',
        name: 'Trópico',
        price: 18000,
        description:
          'Trópico lleva cold brew y syrup de lulo 🍋. Tiene ese punto fresco y ácido del lulo que queda increíble con el café.',
        featured: true,
        dietaryTags: ['vegan'],
        modifierGroups: syrupsOnly,
      },
      {
        sku: 'etiopia',
        name: 'Etiopia',
        price: 20000,
        description:
          'Etiopia mezcla nuestro cold brew con syrup de tamarindo 🌿. Es una combinación fresca, frutal y con un toque ácido muy rico.',
        dietaryTags: ['vegan'],
        modifierGroups: syrupsOnly,
      },
      {
        sku: 'pistachio-cream',
        name: 'Pistachio Cream',
        price: 20000,
        description:
          'Si te gusta el pistacho, este es para ti 💚. Cold brew, crema fría de pistacho y una textura bien cremosa para equilibrar el café.',
        allergens: ['dairy', 'tree-nut'],
        modifierGroups: syrupsOnly,
      },
    ],
  ],
  [
    'Frappé',
    [
      {
        sku: 'frappe-clasico',
        name: 'Frappé Clásico',
        price: 14000,
        description:
          'El clásico es sencillo y delicioso 🧊. Espresso doble y leche, llevados a una bebida fría, cremosa y refrescante.',
        allergens: ['dairy'],
        modifierGroups: milkAndSyrups,
      },
      {
        sku: 'oreo-mocca-crumble',
        name: 'Oreo Mocca Crumble',
        price: 16000,
        description:
          'Este es para darse un gusto 🍪. Espresso doble, Oreo y una textura cremosa con ese toque de chocolate que nunca falla.',
        allergens: ['dairy', 'gluten'],
        modifierGroups: milkAndSyrups,
      },
      {
        sku: 'nutcaramel',
        name: 'Nutcaramel',
        price: 18000,
        description:
          'Nutcaramel es dulce, cremoso y bien goloso 🥜. Espresso, mantequilla de maní, caramelo y leche en una sola bebida.',
        allergens: ['dairy', 'peanut'],
        modifierGroups: milkAndSyrups,
      },
      {
        sku: 'frappe-milo',
        name: 'Frappé Milo',
        price: 15000,
        description:
          'Si eres fan del Milo, este es para ti 🤎. Cremoso, frío y con ese sabor que nos recuerda a algo rico de toda la vida.',
        allergens: ['dairy'],
        modifierGroups: milkAndSyrups,
      },
    ],
  ],
  [
    'Tés',
    [
      {
        sku: 'masala-chai',
        name: 'Masala Chai',
        price: 12000,
        description:
          'El masala chai es una bebida tradicional de la India 🌿. Es especiado, aromático y calientito; perfecto si quieres algo diferente al café.',
        allergens: ['dairy'],
        modifierGroups: milkAndSyrups,
      },
      {
        sku: 'ice-chai',
        name: 'Ice Chai',
        price: 15000,
        description:
          'El ice chai es la versión fría y refrescante del chai 🧊. Tiene ese sabor especiado y aromático, pero servido bien frío.',
        allergens: ['dairy'],
        modifierGroups: milkAndSyrups,
      },
      {
        sku: 'dirty-chai',
        name: 'Dirty Chai',
        price: 16000,
        description:
          'El dirty chai es para los que no quieren escoger entre chai y café ☕🌿. Mezclamos el chai con espresso para tener especias, dulzor y carácter en una sola taza.',
        featured: true,
        allergens: ['dairy'],
        modifierGroups: milkAndSyrups,
      },
      {
        sku: 'infusion',
        name: 'Infusión',
        price: 10000,
        description:
          'Una opción ligera y aromática 🌿. Ideal si quieres disfrutar una bebida caliente sin café.',
        dietaryTags: ['vegan'],
      },
      {
        sku: 'matcha',
        name: 'Matcha',
        price: 14000,
        description:
          'El matcha es un té verde tradicional de Japón 🍵. Tiene un sabor vegetal, delicado y muy particular; si nunca lo has probado, vale la pena descubrirlo.',
        dietaryTags: ['vegan'],
        modifierGroups: syrupsOnly,
      },
      {
        sku: 'ice-matcha-latte',
        name: 'Ice Matcha Latte',
        price: 15000,
        description:
          'El matcha latte frío es cremoso, fresco y diferente 🍵🧊. El sabor del matcha se mezcla con la leche para una bebida suave y refrescante.',
        allergens: ['dairy'],
        modifierGroups: milkAndSyrups,
      },
      {
        sku: 'dirty-matcha',
        name: 'Dirty Matcha',
        price: 16000,
        description:
          'El dirty matcha es ese encuentro entre matcha y café que no sabías que necesitabas 🍵☕. Cremoso, intenso y con mucha personalidad.',
        allergens: ['dairy'],
        modifierGroups: milkAndSyrups,
      },
      {
        sku: 'caribe-matcha',
        name: 'Caribe Matcha',
        price: 16000,
        description:
          'Caribe es matcha con un toque tropical 🌴. Le agregamos syrup de corozo para darle dulzor y una nota frutal muy rica.',
        allergens: ['dairy'],
        modifierGroups: milkAndSyrups,
      },
      {
        sku: 'matcha-temporada',
        name: 'Matcha de temporada',
        price: 18000,
        description:
          'El matcha de temporada cambia según lo que tengamos disponible 🌿. Puede venir con ciruela, tamarindo o coco, así que siempre hay algo nuevo por descubrir.',
        allergens: ['dairy'],
        modifierGroups: milkAndSyrups,
      },
    ],
  ],
  [
    'Jugos',
    [
      {
        sku: 'jugo-naranja',
        name: 'Jugo de naranja',
        price: 8000,
        description:
          'Clásico, fresco y natural 🍊. Un jugo de naranja perfecto para empezar el día.',
        dietaryTags: ['vegan'],
      },
      {
        sku: 'jugo-temporada',
        name: 'Jugo de temporada',
        price: 14000,
        description:
          'Este cambia según la fruta que esté en su mejor momento 🍓. Una opción fresca para probar algo diferente.',
        dietaryTags: ['vegan'],
      },
      {
        sku: 'limonada-coco',
        name: 'Limonada de coco',
        price: 17000,
        description:
          'Fresca, cremosa y tropical 🥥. La acidez del limón se encuentra con el dulzor y la textura del coco.',
        dietaryTags: ['vegan'],
      },
    ],
  ],
  [
    'Fizz',
    [
      {
        sku: 'limonada-toria',
        name: 'Limonada Toria',
        price: 16000,
        description:
          'Una limonada fresca y floral ✨. El limón se mezcla con una infusión de flor de clitoria para darle un toque diferente y muy especial.',
        dietaryTags: ['vegan'],
        modifierGroups: syrupsOnly,
      },
      {
        sku: 'cordial',
        name: 'Cordial',
        price: 16000,
        description:
          'Bebida fresca y aromática en cinco sabores 🌹. Costa Dorada y Valle de las Rosas: ligeras, florales y diferentes. Japón Tropical y México Ardiente: para los que disfrutan descubrir sabores nuevos 🌴. Viñas de Francia: aromática y elegante 🍇, perfecta para disfrutar despacio y descubrir sus diferentes notas.',
        variants: [
          { id: 'costa-dorada', name: 'Costa Dorada', sku: 'cordial-costa-dorada', priceDelta: 0 },
          {
            id: 'valle-de-las-rosas',
            name: 'Valle de las Rosas',
            sku: 'cordial-valle-de-las-rosas',
            priceDelta: 0,
          },
          {
            id: 'japon-tropical',
            name: 'Japón Tropical',
            sku: 'cordial-japon-tropical',
            priceDelta: 0,
          },
          {
            id: 'mexico-ardiente',
            name: 'México Ardiente',
            sku: 'cordial-mexico-ardiente',
            priceDelta: 0,
          },
          {
            id: 'vinas-de-francia',
            name: 'Viñas de Francia',
            sku: 'cordial-vinas-de-francia',
            priceDelta: 0,
          },
        ],
      },
    ],
  ],
  [
    'Otros',
    [
      // The docx lists these without a description.
      {
        sku: 'agua',
        name: 'Agua',
        price: 6000,
        description: 'Agua sin gas, bien fría 💧.',
        dietaryTags: ['vegan'],
      },
      {
        sku: 'agua-con-gas',
        name: 'Agua con gas',
        price: 7000,
        description: 'Agua con gas, bien fría 💧.',
        dietaryTags: ['vegan'],
      },
      {
        sku: 'coca-cola',
        name: 'Coca Cola',
        price: 9000,
        description: 'Coca Cola clásica, bien fría 🥤.',
      },
      {
        sku: 'coca-cola-zero',
        name: 'Coca Cola Zero',
        price: 9000,
        description: 'Coca Cola Zero, sin azúcar y bien fría 🥤.',
      },
    ],
  ],
  [
    'Cervezas',
    [
      {
        sku: 'stella-artois',
        name: 'Stella Artois',
        price: 12000,
        description:
          'Una cerveza lager de perfil ligero y refrescante 🍺. Ideal para acompañar algo de comer.',
        allergens: ['gluten'],
        modifierGroups: () => [micheladaGroup()],
        availability: POS_ONLY,
      },
      {
        sku: 'tumbao',
        name: 'Tumbao',
        price: 16000,
        description:
          'Una cerveza artesanal local 🍺. Una buena opción si quieres probar algo hecho por productores de nuestra tierra.',
        allergens: ['gluten'],
        modifierGroups: () => [micheladaGroup()],
        availability: POS_ONLY,
      },
      {
        sku: 'club-colombia',
        name: 'Club Colombia',
        price: 9000,
        description: 'Una clásica colombiana 🍺. Refrescante y perfecta para acompañar la comida.',
        allergens: ['gluten'],
        modifierGroups: () => [micheladaGroup()],
        availability: POS_ONLY,
      },
      {
        sku: 'copa-de-vino',
        name: 'Copa de vino',
        price: 16000,
        description:
          'Una copa para acompañar la tarde 🍷. Si quieres, podemos orientarte según lo que vayas a comer.',
        availability: POS_ONLY,
      },
    ],
  ],
  [
    'Desayunos',
    [
      {
        sku: 'parfait',
        name: 'Parfait',
        price: 20000,
        description:
          'Ligero, fresco y cremoso 🍓. Lleva nuestra granola, yogurt griego, frutas de temporada y crema de frutos secos.',
        allergens: ['dairy', 'tree-nut'],
        dietaryTags: ['vegetarian'],
        modifierGroups: foodExtras,
      },
      {
        sku: 'granola',
        name: 'Granola',
        price: 30000,
        description:
          'Una opción fresca pero bien completa 🌱. Granola de la casa, yogurt griego, frutas de temporada, crema de pistacho y un toque de canela.',
        allergens: ['dairy', 'tree-nut'],
        dietaryTags: ['vegetarian'],
        modifierGroups: foodExtras,
      },
      {
        sku: 'huevos-estrellados',
        name: 'Huevos estrellados',
        price: 26000,
        description:
          'Un desayuno bien completo 🍳. Huevos, salchicha de pollo, queso crema, pan de masa madre y aguacate.',
        allergens: ['egg', 'gluten', 'dairy'],
        modifierGroups: foodExtras,
      },
      {
        sku: 'omelette',
        name: 'Omelette',
        price: 28000,
        description:
          'Un omelette bien completo y lleno de contrastes 🍳. Lleva queso, salchicha alemana, champiñones asados, frutas y pan de masa madre.',
        allergens: ['egg', 'gluten', 'dairy'],
        modifierGroups: foodExtras,
      },
    ],
  ],
  [
    'Bowls',
    [
      {
        sku: 'bowl-lomo',
        name: 'Bowl de lomo de res',
        price: 32000,
        description:
          'Un bowl contundente y lleno de sabor 🥩. Lomo de res, vegetales, papa criolla y arroz blanco premium.',
        modifierGroups: foodExtras,
      },
      {
        sku: 'bowl-pollo',
        name: 'Bowl de pollo',
        price: 32000,
        description:
          'Cremoso, fresco y completo 🍗. Pollo y champiñones en salsa blanca, arroz premium y ensalada con un toque crujiente.',
        allergens: ['dairy'],
        modifierGroups: foodExtras,
      },
      {
        sku: 'bowl-pulled-pork',
        name: 'Bowl Pulled Pork',
        price: 30000,
        description:
          'Cerdo cocinado para quedar bien suave y lleno de sabor 🐷. Lo acompañamos con arroz premium y nuestro coleslaw.',
        modifierGroups: foodExtras,
      },
      {
        sku: 'ensalada-de-la-casa',
        name: 'Ensalada de la casa',
        price: 34000,
        description:
          'Fresca, pero con mucho sabor 🥗. Pollo, queso feta, tomate cherry, lechuga, orégano y nuestra salsa blanca, con un toque de miel picante.',
        allergens: ['dairy'],
        modifierGroups: foodExtras,
      },
    ],
  ],
  [
    'All Day',
    [
      {
        sku: 'sandwich-pulled-pork',
        name: 'Sándwich Pulled Pork',
        price: 36000,
        description:
          'Cerdo suave, quesos, cebolla encurtida y nuestras salsas en pan de masa madre 🐷. Una combinación entre cremoso, ácido y lleno de sabor.',
        allergens: ['gluten', 'dairy'],
        modifierGroups: foodExtras,
      },
      {
        sku: 'sandwich-clasico',
        name: 'Sándwich Clásico',
        price: 32000,
        description:
          'Un clásico que nunca falla 🥪. Jamón de pavo, mozzarella, mostaza Dijon y mayonesa de la casa.',
        allergens: ['gluten', 'dairy'],
        modifierGroups: foodExtras,
      },
      {
        sku: 'huevos-tocineta',
        name: 'Huevos Tocineta',
        price: 33000,
        description:
          'Para un desayuno con ganas de quedarse hasta el almuerzo 🍳. Huevos revueltos, tocineta, aguacate, quesos y nuestra combinación de salsas.',
        allergens: ['egg', 'gluten', 'dairy'],
        modifierGroups: foodExtras,
      },
      {
        sku: 'pollo-coleslaw',
        name: 'Pollo Coleslaw',
        price: 36000,
        description:
          'Crujiente, cremoso y lleno de sabor 🍗. Pollo apanado, coleslaw MURA, quesos y mostaza.',
        allergens: ['gluten', 'dairy'],
        modifierGroups: foodExtras,
      },
      {
        sku: 'sandwich-avellana',
        name: 'Sándwich de Avellana',
        price: 30000,
        description:
          'Si te gustan las combinaciones dulces, este es para ti 🌰. Crema de avellana, mantequilla de maní y banano.',
        allergens: ['gluten', 'tree-nut', 'peanut'],
        dietaryTags: ['vegetarian'],
        modifierGroups: foodExtras,
      },
      {
        sku: 'salchipan',
        name: 'Salchipan',
        price: 26000,
        description:
          'Un clásico para comer sin complicarse 🌭. Salchicha alemana, queso, coleslaw y mostaza en nuestro pan de masa madre.',
        allergens: ['gluten', 'dairy'],
        modifierGroups: foodExtras,
      },
      {
        sku: 'burger',
        name: 'Burger',
        price: 38000,
        description:
          'Una burger bien completa 🍔. Carne Angus, tocineta, quesos, tomate, lechuga cogollo y nuestra salsa de la casa.',
        featured: true,
        allergens: ['gluten', 'dairy'],
        modifierGroups: foodExtras,
      },
      {
        sku: 'choripan',
        name: 'Choripan',
        price: 26000,
        description:
          'Chorizo argentino, queso Muenster y mayochurri 🌭. Sencillo, contundente y lleno de sabor.',
        allergens: ['gluten', 'dairy'],
        modifierGroups: foodExtras,
      },
    ],
  ],
];

const productId = (n: number): string => `${ID_PREFIX}0000000030${String(n).padStart(2, '0')}`;
const preferenceId = (n: number): string => `${ID_PREFIX}0000000040${String(n).padStart(2, '0')}`;

function defineProducts(): MuraProductSeed[] {
  const products: MuraProductSeed[] = [];
  for (const [category, specs] of MENU) {
    specs.forEach((spec, index) => {
      const seed: MuraProductSeed = {
        _id: productId(products.length + 1),
        name: spec.name,
        description: spec.description,
        price: spec.price,
        category,
        sku: spec.sku,
        stock: 0,
        trackStock: false,
        stockUnit: 'unit',
        availability: { ...(spec.availability ?? ONLINE) },
        serviceSchedules: [],
        allergens: [...(spec.allergens ?? [])],
        dietaryTags: [...(spec.dietaryTags ?? [])],
        modifierGroups: spec.modifierGroups ? spec.modifierGroups() : [],
        kitchenStationIds: [],
        sortOrder: (index + 1) * 10,
      };
      if (spec.variants) seed.variants = spec.variants.map((v) => ({ ...v }));
      if (spec.featured) seed.featured = true;
      products.push(seed);
    });
  }
  return products;
}

// Menu order; `_id` 01..64 follows the same order.
export const MURA_PRODUCTS: readonly MuraProductSeed[] = defineProducts();

export function featuredProducts(): MuraProductSeed[] {
  return MURA_PRODUCTS.filter((p) => p.featured === true);
}

// ---------------------------------------------------------------------------
// Fully-formed Mongo documents (satisfy the validators in `src/db/setup.ts`)
// ---------------------------------------------------------------------------

export interface BuildMuraDocumentsOptions {
  now: Date;
  imageBaseUrl: string;
  createdBy: string;
}

export interface MuraDocuments {
  business: Business;
  branch: Branch;
  categories: Category[];
  products: Product[];
  productPreferences: ProductPreference[];
}

export function buildMuraDocuments({
  now,
  imageBaseUrl,
  createdBy,
}: BuildMuraDocumentsOptions): MuraDocuments {
  const imageUrl = muraPlaceholderImageUrl(imageBaseUrl);

  const business: Business = {
    ...MURA_BUSINESS,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };

  const branch: Branch = {
    ...MURA_BRANCH,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    createdBy,
  };

  const categories: Category[] = MURA_CATEGORIES.map((c) => ({
    _id: c._id,
    businessId: MURA_BUSINESS_ID,
    name: c.name,
    description: c.description,
    sortOrder: c.sortOrder,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    createdBy,
  }));

  // Deep-copied so callers (and the Mongo driver) never touch the shared
  // `MURA_PRODUCTS` constant.
  const products: Product[] = MURA_PRODUCTS.map(({ featured: _featured, ...seed }) => ({
    ...structuredClone(seed),
    businessId: MURA_BUSINESS_ID,
    branchId: MURA_BRANCH_ID,
    imageUrl,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    createdBy,
  }));

  const productPreferences: ProductPreference[] = featuredProducts().map((p, index) => ({
    _id: preferenceId(index + 1),
    businessId: MURA_BUSINESS_ID,
    branchId: MURA_BRANCH_ID,
    productId: p._id,
    featured: true,
    updatedAt: now,
    updatedBy: createdBy,
  }));

  return { business, branch, categories, products, productPreferences };
}
