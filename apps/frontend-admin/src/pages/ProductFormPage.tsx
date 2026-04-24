import type {
  Allergen,
  DietaryTag,
  ModifierGroup,
  ModifierOption,
  Product,
  ProductAvailability,
  ServiceSchedule,
  StockUnit,
} from '@kaipos/shared';
import { formatCurrency, hasPermission } from '@kaipos/shared';
import {
  Alert,
  AlertTitle,
  alpha,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  ChevronRight,
  Divider,
  FormControl,
  FormControlLabel,
  FormHelperText,
  IconButton,
  ImageIcon,
  InputLabel,
  MenuItem,
  Plus,
  Select,
  Skeleton,
  Stack,
  Switch,
  TextField,
  Typography,
  Upload,
  X,
} from '@kaipos/ui';
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { EmptyState, PageHeader } from '../components/index.js';
import { useAuth } from '../context/AuthContext.js';
import { useActiveBranch } from '../hooks/useActiveBranch.js';
import { ApiError, apiJson } from '../lib/api.js';
import {
  createProduct,
  generateUploadUrl,
  getProduct,
  listProducts,
  toProductsApiError,
  updateProduct,
  type CreateProductPayload,
  type UpdateProductPayload,
} from '../lib/products-api.js';

// ---------------------------------------------------------------------------
// Constants & labels
// ---------------------------------------------------------------------------

const ALLERGENS: readonly Allergen[] = [
  'gluten',
  'dairy',
  'egg',
  'peanut',
  'tree-nut',
  'soy',
  'fish',
  'shellfish',
  'sesame',
] as const;

const DIETARY_TAGS: readonly DietaryTag[] = [
  'vegetarian',
  'vegan',
  'gluten-free',
  'keto',
  'halal',
  'kosher',
] as const;

const SERVICE_SCHEDULES: readonly ServiceSchedule[] = ['breakfast', 'lunch', 'dinner'] as const;

const STOCK_UNITS: readonly StockUnit[] = ['unit', 'kg', 'L'] as const;

const ALLERGEN_LABELS: Record<Allergen, string> = {
  gluten: 'Gluten',
  dairy: 'Lácteos',
  egg: 'Huevo',
  peanut: 'Maní',
  'tree-nut': 'Frutos secos',
  soy: 'Soya',
  fish: 'Pescado',
  shellfish: 'Mariscos',
  sesame: 'Ajonjolí',
};

const DIETARY_LABELS: Record<DietaryTag, string> = {
  vegetarian: 'Vegetariano',
  vegan: 'Vegano',
  'gluten-free': 'Sin gluten',
  keto: 'Keto',
  halal: 'Halal',
  kosher: 'Kosher',
};

const SCHEDULE_LABELS: Record<ServiceSchedule, string> = {
  breakfast: 'Desayuno',
  lunch: 'Almuerzo',
  dinner: 'Cena',
};

const STOCK_UNIT_LABELS: Record<StockUnit, string> = {
  unit: 'Unidad',
  kg: 'Kilogramos',
  L: 'Litros',
};

const UPLOAD_MIME: readonly string[] = ['image/jpeg', 'image/png', 'image/webp'] as const;
const UPLOAD_MAX_BYTES = 2 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface KitchenStation {
  _id: string;
  branchId: string;
  name: string;
}

interface FormState {
  name: string;
  description: string;
  price: string;
  category: string;
  sku: string;
  stock: string;
  cost: string;
  taxRate: string;
  imageUrl: string;
  trackStock: boolean;
  lowStockThreshold: string;
  stockUnit: StockUnit;
  availability: ProductAvailability;
  serviceSchedules: ServiceSchedule[];
  allergens: Allergen[];
  dietaryTags: DietaryTag[];
  modifierGroups: ModifierGroup[];
  kitchenStationIds: string[];
}

type LoadState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready' };

type Mode = 'new' | 'edit';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function initialForm(): FormState {
  return {
    name: '',
    description: '',
    price: '',
    category: '',
    sku: '',
    stock: '0',
    cost: '',
    taxRate: '',
    imageUrl: '',
    trackStock: true,
    lowStockThreshold: '',
    stockUnit: 'unit',
    availability: { pos: true, online: false, kiosk: false },
    serviceSchedules: [],
    allergens: [],
    dietaryTags: [],
    modifierGroups: [],
    kitchenStationIds: [],
  };
}

function productToForm(p: Product): FormState {
  return {
    name: p.name,
    description: p.description ?? '',
    price: String(p.price ?? ''),
    category: p.category,
    sku: p.sku,
    stock: String(p.stock ?? 0),
    cost: p.cost !== undefined ? String(p.cost) : '',
    taxRate: p.taxRate !== undefined ? String(p.taxRate) : '',
    imageUrl: p.imageUrl ?? '',
    trackStock: p.trackStock,
    lowStockThreshold: p.lowStockThreshold !== undefined ? String(p.lowStockThreshold) : '',
    stockUnit: p.stockUnit,
    availability: { ...p.availability },
    serviceSchedules: [...p.serviceSchedules],
    allergens: [...p.allergens],
    dietaryTags: [...p.dietaryTags],
    modifierGroups: p.modifierGroups.map((g) => ({
      ...g,
      options: g.options.map((o) => ({ ...o })),
    })),
    kitchenStationIds: [...p.kitchenStationIds],
  };
}

function parseOptionalNumber(value: string): number | undefined {
  if (value.trim() === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function parseRequiredNumber(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function autoSku(category: string, name: string): string {
  const catPart = category
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()
    .slice(0, 5);
  const namePart = name
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()
    .slice(0, 3);
  if (!catPart || !namePart) return '';
  return `${catPart}-${namePart}-001`;
}

function formToCreatePayload(form: FormState, branchId: string): CreateProductPayload {
  return {
    branchId,
    name: form.name.trim(),
    description: form.description.trim(),
    price: parseRequiredNumber(form.price),
    category: form.category.trim(),
    sku: form.sku.trim(),
    stock: parseRequiredNumber(form.stock),
    ...(form.imageUrl ? { imageUrl: form.imageUrl } : {}),
    ...(form.cost.trim() !== '' ? { cost: parseRequiredNumber(form.cost) } : {}),
    ...(form.taxRate.trim() !== '' ? { taxRate: parseRequiredNumber(form.taxRate) } : {}),
    trackStock: form.trackStock,
    ...(form.lowStockThreshold.trim() !== ''
      ? { lowStockThreshold: parseRequiredNumber(form.lowStockThreshold) }
      : {}),
    stockUnit: form.stockUnit,
    availability: form.availability,
    serviceSchedules: form.serviceSchedules,
    allergens: form.allergens,
    dietaryTags: form.dietaryTags,
    modifierGroups: form.modifierGroups,
    kitchenStationIds: form.kitchenStationIds,
  };
}

function formToUpdatePayload(form: FormState): UpdateProductPayload {
  return {
    name: form.name.trim(),
    description: form.description.trim(),
    price: parseRequiredNumber(form.price),
    category: form.category.trim(),
    sku: form.sku.trim(),
    stock: parseRequiredNumber(form.stock),
    imageUrl: form.imageUrl || undefined,
    cost: parseOptionalNumber(form.cost),
    taxRate: parseOptionalNumber(form.taxRate),
    trackStock: form.trackStock,
    lowStockThreshold: parseOptionalNumber(form.lowStockThreshold),
    stockUnit: form.stockUnit,
    availability: form.availability,
    serviceSchedules: form.serviceSchedules,
    allergens: form.allergens,
    dietaryTags: form.dietaryTags,
    modifierGroups: form.modifierGroups,
    kitchenStationIds: form.kitchenStationIds,
  };
}

function validateClientSide(
  form: FormState,
  branchId: string | null,
): Record<string, string> | null {
  const errors: Record<string, string> = {};
  if (!form.name.trim()) errors.name = 'El nombre es obligatorio.';
  if (!form.category.trim()) errors.category = 'La categoría es obligatoria.';
  if (!form.sku.trim()) errors.sku = 'El SKU es obligatorio.';
  if (form.price.trim() === '' || Number.isNaN(Number(form.price)) || Number(form.price) < 0) {
    errors.price = 'Ingresa un precio válido.';
  }
  if (!branchId) errors.branchId = 'Selecciona una sucursal.';
  return Object.keys(errors).length > 0 ? errors : null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProductFormPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { branchId: activeBranchId, branchIds } = useActiveBranch();

  const mode: Mode = id ? 'edit' : 'new';
  const canWrite = user ? hasPermission(user.role, 'products:write') : false;

  const paramBranchId = searchParams.get('branchId');
  const [branchId, setBranchId] = useState<string | null>(() => {
    if (mode === 'new') return paramBranchId ?? activeBranchId;
    return null;
  });

  const [loadState, setLoadState] = useState<LoadState>(() =>
    mode === 'edit' ? { status: 'loading' } : { status: 'ready' },
  );
  const [form, setForm] = useState<FormState>(() => initialForm());
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [skuTouched, setSkuTouched] = useState(false);
  const [stations, setStations] = useState<KitchenStation[] | null>(null);
  const [stationsError, setStationsError] = useState<string | null>(null);

  // Image upload
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const updateForm = useCallback((patch: Partial<FormState>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  }, []);

  // Load existing product in edit mode
  useEffect(() => {
    if (mode !== 'edit' || !id) return;
    let cancelled = false;
    setLoadState({ status: 'loading' });
    getProduct(id)
      .then((product) => {
        if (cancelled) return;
        setBranchId(product.branchId);
        setForm(productToForm(product));
        setSkuTouched(true);
        setLoadState({ status: 'ready' });
      })
      .catch((err) => {
        if (cancelled) return;
        const mapped = toProductsApiError(err);
        const message =
          mapped.status === 404
            ? 'No encontramos este producto.'
            : mapped.status === 403
              ? 'No tienes permiso para ver este producto.'
              : mapped.message || 'No pudimos cargar el producto.';
        setLoadState({ status: 'error', message });
      });
    return () => {
      cancelled = true;
    };
  }, [id, mode]);

  // Seed category options from existing products in this branch
  useEffect(() => {
    if (!branchId) return;
    let cancelled = false;
    listProducts({ branchId, includeInactive: true })
      .then((products) => {
        if (cancelled) return;
        const set = new Set<string>();
        for (const p of products) set.add(p.category);
        setCategoryOptions(Array.from(set).sort((a, b) => a.localeCompare(b, 'es')));
      })
      .catch(() => {
        // Non-fatal: users can still type a new category.
        if (!cancelled) setCategoryOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [branchId]);

  // Load kitchen stations
  useEffect(() => {
    if (!branchId) return;
    let cancelled = false;
    setStations(null);
    setStationsError(null);
    apiJson<KitchenStation[]>(`/api/kitchen-stations?branchId=${encodeURIComponent(branchId)}`)
      .then((data) => {
        if (!cancelled) setStations(data);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 403) {
          setStationsError('No tienes permiso para ver las estaciones de esta sucursal.');
        } else {
          setStationsError('No pudimos cargar las estaciones de cocina.');
        }
        setStations([]);
      });
    return () => {
      cancelled = true;
    };
  }, [branchId]);

  // Auto-populate SKU in create mode until the user edits it manually
  useEffect(() => {
    if (mode !== 'new' || skuTouched) return;
    const suggested = autoSku(form.category, form.name);
    if (suggested && suggested !== form.sku) {
      setForm((prev) => ({ ...prev, sku: suggested }));
    }
  }, [form.category, form.name, form.sku, mode, skuTouched]);

  const handleImagePick = useCallback(
    async (file: File) => {
      if (!branchId) {
        setUploadError('Selecciona una sucursal antes de subir la imagen.');
        return;
      }
      if (!UPLOAD_MIME.includes(file.type)) {
        setUploadError('Formato no soportado. Usa JPG, PNG o WEBP.');
        return;
      }
      if (file.size > UPLOAD_MAX_BYTES) {
        setUploadError('La imagen supera el máximo de 2 MB.');
        return;
      }
      setUploadError(null);
      setUploading(true);
      try {
        const { uploadUrl, publicUrl } = await generateUploadUrl({
          branchId,
          contentType: file.type as 'image/jpeg' | 'image/png' | 'image/webp',
          fileSize: file.size,
        });
        const putRes = await fetch(uploadUrl, {
          method: 'PUT',
          headers: { 'content-type': file.type },
          body: file,
        });
        if (!putRes.ok) {
          throw new Error(`S3 upload failed: ${putRes.status}`);
        }
        updateForm({ imageUrl: publicUrl });
      } catch (err) {
        const mapped = err instanceof ApiError ? toProductsApiError(err) : null;
        if (mapped?.code === 'ASSETS_NOT_CONFIGURED') {
          setUploadError('El almacenamiento de imágenes no está configurado en este entorno.');
        } else {
          setUploadError('No pudimos subir la imagen. Inténtalo de nuevo.');
        }
      } finally {
        setUploading(false);
      }
    },
    [branchId, updateForm],
  );

  const handleSubmit = useCallback(async () => {
    const errors = validateClientSide(form, branchId);
    if (errors) {
      setFieldErrors(errors);
      setSubmitError('Revisa los campos marcados y vuelve a intentarlo.');
      return;
    }
    setFieldErrors({});
    setSubmitError(null);
    setSubmitting(true);
    try {
      if (mode === 'new') {
        await createProduct(formToCreatePayload(form, branchId!));
      } else if (id) {
        await updateProduct(id, formToUpdatePayload(form));
      }
      navigate('/products');
    } catch (err) {
      const mapped = toProductsApiError(err);
      if (mapped.code === 'SKU_ALREADY_EXISTS') {
        setFieldErrors({ sku: 'Este SKU ya existe en esta sucursal.' });
        setSubmitError('Corrige el SKU duplicado para continuar.');
      } else if (mapped.status === 403) {
        setSubmitError('No tienes permiso para publicar productos en esta sucursal.');
      } else if (mapped.code === 'VALIDATION_ERROR' && mapped.details) {
        const next: Record<string, string> = {};
        for (const d of mapped.details) {
          if (d.field) next[d.field] = d.message;
        }
        setFieldErrors(next);
        setSubmitError('Revisa los campos marcados y vuelve a intentarlo.');
      } else {
        setSubmitError(mapped.message || 'No pudimos guardar los cambios. Inténtalo de nuevo.');
      }
    } finally {
      setSubmitting(false);
    }
  }, [branchId, form, id, mode, navigate]);

  // ---------------------------------------------------------------------------
  // Gating: if the user lost the branch context somehow, or the edit failed to
  // load, render a minimal shell.
  // ---------------------------------------------------------------------------

  if (loadState.status === 'loading') {
    return <FormSkeleton />;
  }

  if (loadState.status === 'error') {
    return (
      <>
        <PageHeader title={mode === 'new' ? 'Nuevo producto' : 'Editar producto'} />
        <Stack spacing={2} alignItems="flex-start">
          <Alert severity="error" sx={{ width: '100%' }}>
            {loadState.message}
          </Alert>
          <Button variant="outlined" onClick={() => navigate('/products')}>
            Volver al listado
          </Button>
        </Stack>
      </>
    );
  }

  if (mode === 'new' && !branchId) {
    return (
      <>
        <PageHeader title="Nuevo producto" />
        <Alert severity="info">
          {branchIds.length === 0
            ? 'No tienes sucursales asignadas. Pide a un administrador que te agregue a una sucursal.'
            : 'Selecciona una sucursal desde el listado para crear un producto.'}
        </Alert>
        <Box sx={{ mt: 2 }}>
          <Button variant="outlined" onClick={() => navigate('/products')}>
            Volver al listado
          </Button>
        </Box>
      </>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <Box sx={{ pb: 6 }}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        alignItems={{ xs: 'flex-start', sm: 'center' }}
        justifyContent="space-between"
        sx={{ mb: 3 }}
      >
        <Breadcrumb category={form.category} name={form.name} mode={mode} />
        <Stack direction="row" spacing={1} alignItems="center">
          <Chip
            size="small"
            label="Borrador · guardado hace 4s"
            variant="outlined"
            sx={{ color: 'text.secondary' }}
          />
          <Button size="small" disabled>
            Vista previa
          </Button>
          <Button size="small" variant="outlined" disabled>
            Guardar borrador
          </Button>
          <Button
            size="small"
            variant="contained"
            onClick={handleSubmit}
            disabled={submitting || !canWrite}
          >
            {submitting ? 'Publicando…' : mode === 'new' ? 'Publicar producto' : 'Guardar cambios'}
          </Button>
        </Stack>
      </Stack>

      {mode === 'edit' && branchId && (
        <Box sx={{ mb: 2 }}>
          <Chip
            size="small"
            label={`Sucursal: ${branchId}`}
            variant="outlined"
            aria-label="Sucursal del producto"
          />
        </Box>
      )}

      {submitError && (
        <Alert severity="error" sx={{ mb: 3 }}>
          <AlertTitle>No pudimos publicar</AlertTitle>
          {submitError}
        </Alert>
      )}

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) 360px' },
          gap: 3,
          alignItems: 'start',
        }}
      >
        <Stack spacing={3}>
          <BasicInfoCard
            form={form}
            updateForm={updateForm}
            fieldErrors={fieldErrors}
            categoryOptions={categoryOptions}
            creatingCategory={creatingCategory}
            setCreatingCategory={setCreatingCategory}
            onSkuTouched={() => setSkuTouched(true)}
          />

          <PricingCard form={form} updateForm={updateForm} fieldErrors={fieldErrors} />

          <InventoryCard form={form} updateForm={updateForm} />

          <ModifiersCard
            groups={form.modifierGroups}
            onChange={(next) => updateForm({ modifierGroups: next })}
          />

          <TagsCard form={form} updateForm={updateForm} />
        </Stack>

        <Box
          sx={{
            position: { md: 'sticky' },
            top: { md: 16 },
            display: 'flex',
            flexDirection: 'column',
            gap: 3,
          }}
        >
          <PosPreviewCard form={form} />

          <AvailabilityCard form={form} updateForm={updateForm} />

          <ImageCard
            imageUrl={form.imageUrl}
            uploading={uploading}
            uploadError={uploadError}
            fileInputRef={fileInputRef}
            onPick={handleImagePick}
            onRemove={() => updateForm({ imageUrl: '' })}
          />

          <KitchenStationsCard
            stations={stations}
            error={stationsError}
            selected={form.kitchenStationIds}
            onToggle={(stationId) => {
              const next = form.kitchenStationIds.includes(stationId)
                ? form.kitchenStationIds.filter((s) => s !== stationId)
                : [...form.kitchenStationIds, stationId];
              updateForm({ kitchenStationIds: next });
            }}
            branchId={branchId}
          />
        </Box>
      </Box>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Breadcrumb({ category, name, mode }: { category: string; name: string; mode: Mode }) {
  const parts: string[] = [];
  if (category) parts.push(category);
  parts.push(name || (mode === 'new' ? 'Nuevo producto' : 'Sin nombre'));

  return (
    <Stack direction="row" spacing={1} alignItems="center" sx={{ color: 'text.secondary' }}>
      <Typography
        component="a"
        href="/products"
        variant="body2"
        sx={{ color: 'text.secondary', textDecoration: 'none', fontWeight: 600 }}
      >
        ← Productos
      </Typography>
      {parts.map((p, i) => (
        <Stack key={`${p}-${i}`} direction="row" spacing={1} alignItems="center">
          <ChevronRight size={14} aria-hidden />
          <Typography
            variant="body2"
            sx={{
              color: i === parts.length - 1 ? 'text.primary' : 'text.secondary',
              fontWeight: i === parts.length - 1 ? 650 : 500,
            }}
          >
            {p}
          </Typography>
        </Stack>
      ))}
    </Stack>
  );
}

interface BasicInfoCardProps {
  form: FormState;
  updateForm: (patch: Partial<FormState>) => void;
  fieldErrors: Record<string, string>;
  categoryOptions: string[];
  creatingCategory: boolean;
  setCreatingCategory: (v: boolean) => void;
  onSkuTouched: () => void;
}

function BasicInfoCard({
  form,
  updateForm,
  fieldErrors,
  categoryOptions,
  creatingCategory,
  setCreatingCategory,
  onSkuTouched,
}: BasicInfoCardProps) {
  return (
    <SectionCard title="Información básica" subtitle="Cómo aparece en POS, KDS y online.">
      <Stack spacing={2}>
        <TextField
          label="Nombre del producto"
          value={form.name}
          onChange={(e) => updateForm({ name: e.target.value })}
          error={Boolean(fieldErrors.name)}
          helperText={fieldErrors.name}
          fullWidth
          required
        />
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          {creatingCategory ? (
            <FormControl sx={{ flex: 1 }} error={Boolean(fieldErrors.category)}>
              <TextField
                label="Nueva categoría"
                value={form.category}
                onChange={(e) => updateForm({ category: e.target.value })}
                error={Boolean(fieldErrors.category)}
                helperText={fieldErrors.category}
                fullWidth
                required
              />
              <Button
                size="small"
                onClick={() => setCreatingCategory(false)}
                sx={{ alignSelf: 'flex-start', mt: 0.5 }}
              >
                Elegir existente
              </Button>
            </FormControl>
          ) : (
            <FormControl sx={{ flex: 1 }} error={Boolean(fieldErrors.category)}>
              <InputLabel id="category-select-label">Categoría</InputLabel>
              <Select
                labelId="category-select-label"
                label="Categoría"
                value={form.category}
                onChange={(e) => {
                  const next = typeof e.target.value === 'string' ? e.target.value : '';
                  if (next === '__new__') {
                    setCreatingCategory(true);
                    updateForm({ category: '' });
                  } else {
                    updateForm({ category: next });
                  }
                }}
                required
              >
                {categoryOptions.map((c) => (
                  <MenuItem key={c} value={c}>
                    {c}
                  </MenuItem>
                ))}
                {form.category && !categoryOptions.includes(form.category) && (
                  <MenuItem value={form.category}>{form.category}</MenuItem>
                )}
                <MenuItem value="__new__" sx={{ fontWeight: 600 }}>
                  + Crear nueva
                </MenuItem>
              </Select>
              {fieldErrors.category && <FormHelperText>{fieldErrors.category}</FormHelperText>}
            </FormControl>
          )}

          <TextField
            label="SKU"
            value={form.sku}
            onChange={(e) => {
              onSkuTouched();
              updateForm({ sku: e.target.value.toUpperCase() });
            }}
            error={Boolean(fieldErrors.sku)}
            helperText={fieldErrors.sku ?? 'Se autogenera; puedes editarlo.'}
            inputProps={{ style: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' } }}
            sx={{ flex: 1 }}
            required
          />
        </Stack>
        <TextField
          label="Descripción corta"
          value={form.description}
          onChange={(e) => updateForm({ description: e.target.value })}
          multiline
          minRows={3}
          fullWidth
          helperText="Aparece en el menú online y recibo."
        />
      </Stack>
    </SectionCard>
  );
}

interface PricingCardProps {
  form: FormState;
  updateForm: (patch: Partial<FormState>) => void;
  fieldErrors: Record<string, string>;
}

function PricingCard({ form, updateForm, fieldErrors }: PricingCardProps) {
  const priceNumber = parseOptionalNumber(form.price);
  const costNumber = parseOptionalNumber(form.cost);
  const margin =
    priceNumber && priceNumber > 0 && costNumber !== undefined
      ? {
          profit: priceNumber - costNumber,
          pct: ((priceNumber - costNumber) / priceNumber) * 100,
        }
      : null;

  return (
    <SectionCard
      title="Precio y costos"
      subtitle="Todo sin impuestos. El margen se calcula automáticamente."
    >
      <Stack spacing={2}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField
            label="Precio de venta"
            value={form.price}
            onChange={(e) => updateForm({ price: e.target.value })}
            type="number"
            inputProps={{ min: 0, step: '0.01' }}
            InputProps={{ startAdornment: <AdornmentText>$</AdornmentText> }}
            error={Boolean(fieldErrors.price)}
            helperText={fieldErrors.price}
            sx={{ flex: 1 }}
            required
          />
          <TextField
            label="Costo (COGS)"
            value={form.cost}
            onChange={(e) => updateForm({ cost: e.target.value })}
            type="number"
            inputProps={{ min: 0, step: '0.01' }}
            InputProps={{ startAdornment: <AdornmentText>$</AdornmentText> }}
            helperText="Para calcular margen."
            sx={{ flex: 1 }}
          />
          <TextField
            label="IVA"
            value={form.taxRate}
            onChange={(e) => updateForm({ taxRate: e.target.value })}
            type="number"
            inputProps={{ min: 0, max: 100, step: '0.001' }}
            InputProps={{ endAdornment: <AdornmentText>%</AdornmentText> }}
            sx={{ flex: 1 }}
          />
        </Stack>
        {margin && (
          <Box
            sx={(theme) => ({
              mt: 1,
              px: '14px',
              py: '14px',
              borderRadius: '10px',
              bgcolor: alpha(
                theme.palette.success.main,
                theme.palette.mode === 'light' ? 0.1 : 0.14,
              ),
              border: `1px solid ${alpha(theme.palette.success.main, 0.2)}`,
              color: 'success.dark',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 2,
            })}
          >
            <Box>
              <Typography
                sx={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '.08em',
                  textTransform: 'uppercase',
                  lineHeight: 1,
                }}
              >
                Margen
              </Typography>
              <Typography
                sx={{
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  fontSize: 22,
                  fontWeight: 700,
                  letterSpacing: '-0.01em',
                  mt: '2px',
                }}
              >
                {margin.pct.toFixed(1)}%
              </Typography>
            </Box>
            <Box sx={{ textAlign: 'right' }}>
              <Typography sx={{ fontSize: 13 }}>Ganancia por unidad</Typography>
              <Typography
                sx={{
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  fontSize: 16,
                  fontWeight: 700,
                }}
              >
                {formatCurrency(margin.profit)}
              </Typography>
            </Box>
          </Box>
        )}
      </Stack>
    </SectionCard>
  );
}

interface InventoryCardProps {
  form: FormState;
  updateForm: (patch: Partial<FormState>) => void;
}

function InventoryCard({ form, updateForm }: InventoryCardProps) {
  return (
    <SectionCard title="Inventario" subtitle="Activa para descontar automáticamente al vender.">
      <FormControlLabel
        control={
          <Switch
            checked={form.trackStock}
            onChange={(e) => updateForm({ trackStock: e.target.checked })}
          />
        }
        label={
          <Box>
            <Typography sx={{ fontWeight: 600 }}>Rastrear stock</Typography>
            <Typography variant="body2" color="text.secondary">
              Recibe alertas cuando el stock esté bajo.
            </Typography>
          </Box>
        }
        sx={{ alignItems: 'flex-start', m: 0 }}
      />
      {form.trackStock && (
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mt: 2 }}>
          <TextField
            label="Stock actual"
            value={form.stock}
            onChange={(e) => updateForm({ stock: e.target.value })}
            type="number"
            inputProps={{ min: 0, step: 1 }}
            sx={{ flex: 1 }}
          />
          <TextField
            label="Alerta en"
            value={form.lowStockThreshold}
            onChange={(e) => updateForm({ lowStockThreshold: e.target.value })}
            type="number"
            inputProps={{ min: 0, step: 1 }}
            helperText="Aviso si cae bajo este número."
            sx={{ flex: 1 }}
          />
          <FormControl sx={{ flex: 1 }}>
            <InputLabel id="stock-unit-label">Unidad</InputLabel>
            <Select
              labelId="stock-unit-label"
              label="Unidad"
              value={form.stockUnit}
              onChange={(e) => updateForm({ stockUnit: e.target.value as StockUnit })}
            >
              {STOCK_UNITS.map((u) => (
                <MenuItem key={u} value={u}>
                  {STOCK_UNIT_LABELS[u]}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Stack>
      )}
    </SectionCard>
  );
}

interface ModifiersCardProps {
  groups: ModifierGroup[];
  onChange: (next: ModifierGroup[]) => void;
}

function ModifiersCard({ groups, onChange }: ModifiersCardProps) {
  const addGroup = () => {
    onChange([
      ...groups,
      { id: crypto.randomUUID(), name: 'Nuevo grupo', required: false, options: [] },
    ]);
  };

  const updateGroup = (groupId: string, patch: Partial<ModifierGroup>) => {
    onChange(groups.map((g) => (g.id === groupId ? { ...g, ...patch } : g)));
  };

  const removeGroup = (groupId: string) => {
    onChange(groups.filter((g) => g.id !== groupId));
  };

  const addOption = (groupId: string) => {
    const option: ModifierOption = {
      id: crypto.randomUUID(),
      label: 'Nueva opción',
      priceDelta: 0,
    };
    onChange(groups.map((g) => (g.id === groupId ? { ...g, options: [...g.options, option] } : g)));
  };

  const updateOption = (groupId: string, optionId: string, patch: Partial<ModifierOption>) => {
    onChange(
      groups.map((g) =>
        g.id === groupId
          ? {
              ...g,
              options: g.options.map((o) => (o.id === optionId ? { ...o, ...patch } : o)),
            }
          : g,
      ),
    );
  };

  const removeOption = (groupId: string, optionId: string) => {
    onChange(
      groups.map((g) =>
        g.id === groupId ? { ...g, options: g.options.filter((o) => o.id !== optionId) } : g,
      ),
    );
  };

  return (
    <SectionCard
      title="Modificadores"
      subtitle="Opciones que el cliente puede elegir al ordenar."
      action={
        <Button
          size="small"
          variant="outlined"
          startIcon={<Plus size={16} aria-hidden />}
          onClick={addGroup}
        >
          Grupo nuevo
        </Button>
      }
    >
      {groups.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          Aún no hay grupos. Agrega uno para ofrecer variantes como tamaño o picante.
        </Typography>
      )}
      <Stack spacing={2}>
        {groups.map((group) => (
          <Box
            key={group.id}
            sx={{
              p: 2,
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'divider',
              bgcolor: 'action.hover',
            }}
          >
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
              <Typography
                component="span"
                aria-hidden
                sx={{ color: 'text.disabled', cursor: 'not-allowed', px: 0.5 }}
                title="Reordenar (próximamente)"
              >
                ⋮⋮
              </Typography>
              <TextField
                size="small"
                value={group.name}
                onChange={(e) => updateGroup(group.id, { name: e.target.value })}
                sx={{ flex: 1 }}
                inputProps={{ style: { fontWeight: 600 } }}
              />
              <FormControlLabel
                control={
                  <Switch
                    size="small"
                    checked={group.required}
                    onChange={(e) => updateGroup(group.id, { required: e.target.checked })}
                  />
                }
                label={group.required ? 'Requerido' : 'Opcional'}
                sx={{ m: 0 }}
              />
              <IconButton
                size="small"
                color="error"
                aria-label={`Eliminar grupo ${group.name}`}
                onClick={() => removeGroup(group.id)}
              >
                <X size={16} aria-hidden />
              </IconButton>
            </Stack>

            <Stack spacing={1}>
              {group.options.map((option) => (
                <Stack key={option.id} direction="row" spacing={1} alignItems="center">
                  <TextField
                    size="small"
                    label="Opción"
                    value={option.label}
                    onChange={(e) => updateOption(group.id, option.id, { label: e.target.value })}
                    sx={{ flex: 2 }}
                  />
                  <TextField
                    size="small"
                    label="Δ Precio"
                    type="number"
                    value={option.priceDelta}
                    onChange={(e) =>
                      updateOption(group.id, option.id, {
                        priceDelta: parseRequiredNumber(e.target.value),
                      })
                    }
                    inputProps={{ step: '0.01' }}
                    sx={{ width: 120 }}
                  />
                  <IconButton
                    size="small"
                    aria-label={`Eliminar opción ${option.label}`}
                    onClick={() => removeOption(group.id, option.id)}
                  >
                    <X size={16} aria-hidden />
                  </IconButton>
                </Stack>
              ))}
              <Button
                size="small"
                variant="text"
                startIcon={<Plus size={16} aria-hidden />}
                onClick={() => addOption(group.id)}
                sx={{ alignSelf: 'flex-start' }}
              >
                Opción
              </Button>
            </Stack>
          </Box>
        ))}
      </Stack>
    </SectionCard>
  );
}

interface TagsCardProps {
  form: FormState;
  updateForm: (patch: Partial<FormState>) => void;
}

function TagsCard({ form, updateForm }: TagsCardProps) {
  const toggleAllergen = (a: Allergen) => {
    const next = form.allergens.includes(a)
      ? form.allergens.filter((x) => x !== a)
      : [...form.allergens, a];
    updateForm({ allergens: next });
  };

  const toggleTag = (t: DietaryTag) => {
    const next = form.dietaryTags.includes(t)
      ? form.dietaryTags.filter((x) => x !== t)
      : [...form.dietaryTags, t];
    updateForm({ dietaryTags: next });
  };

  return (
    <SectionCard
      title="Etiquetas y alérgenos"
      subtitle="Aparecen en el menú online y alertas de KDS."
    >
      <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
        Alérgenos
      </Typography>
      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1, mb: 3 }}>
        {ALLERGENS.map((a) => {
          const selected = form.allergens.includes(a);
          return (
            <Chip
              key={a}
              label={ALLERGEN_LABELS[a]}
              clickable
              onClick={() => toggleAllergen(a)}
              color={selected ? 'warning' : 'default'}
              variant={selected ? 'filled' : 'outlined'}
              size="small"
            />
          );
        })}
      </Stack>
      <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
        Dieta
      </Typography>
      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
        {DIETARY_TAGS.map((t) => {
          const selected = form.dietaryTags.includes(t);
          return (
            <Chip
              key={t}
              label={DIETARY_LABELS[t]}
              clickable
              onClick={() => toggleTag(t)}
              color={selected ? 'primary' : 'default'}
              variant={selected ? 'filled' : 'outlined'}
              size="small"
            />
          );
        })}
      </Stack>
    </SectionCard>
  );
}

function PosPreviewCard({ form }: { form: FormState }) {
  const priceNum = parseOptionalNumber(form.price) ?? 0;
  return (
    <SectionCard title="Vista en POS" subtitle="Así se verá el tile en la terminal.">
      <Box
        sx={{
          p: 2,
          borderRadius: 2,
          border: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.paper',
          minHeight: 110,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          gap: 1.5,
        }}
      >
        <Stack direction="row" spacing={1.5} alignItems="flex-start">
          {form.imageUrl ? (
            <Box
              component="img"
              src={form.imageUrl}
              alt=""
              sx={{
                width: 48,
                height: 48,
                borderRadius: 1,
                objectFit: 'cover',
                border: '1px solid',
                borderColor: 'divider',
              }}
            />
          ) : (
            <Box
              aria-hidden
              sx={{
                width: 48,
                height: 48,
                borderRadius: 1,
                display: 'grid',
                placeItems: 'center',
                bgcolor: 'action.hover',
                color: 'text.disabled',
              }}
            >
              <ImageIcon size={20} aria-hidden />
            </Box>
          )}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontWeight: 600, lineHeight: 1.3 }}>
              {form.name || 'Sin nombre'}
            </Typography>
            {form.allergens.length > 0 && (
              <Stack direction="row" spacing={0.5} sx={{ mt: 0.5, flexWrap: 'wrap', gap: 0.5 }}>
                {form.allergens.slice(0, 3).map((a) => (
                  <Chip
                    key={a}
                    label={`⚠ ${ALLERGEN_LABELS[a]}`}
                    size="small"
                    color="warning"
                    variant="outlined"
                  />
                ))}
              </Stack>
            )}
          </Box>
        </Stack>
        <Typography
          sx={{
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontWeight: 700,
            fontSize: 18,
          }}
        >
          {formatCurrency(priceNum)}
        </Typography>
      </Box>
    </SectionCard>
  );
}

interface AvailabilityCardProps {
  form: FormState;
  updateForm: (patch: Partial<FormState>) => void;
}

function AvailabilityCard({ form, updateForm }: AvailabilityCardProps) {
  const setChannel = (channel: keyof ProductAvailability, value: boolean) => {
    updateForm({ availability: { ...form.availability, [channel]: value } });
  };

  const toggleSchedule = (s: ServiceSchedule) => {
    const next = form.serviceSchedules.includes(s)
      ? form.serviceSchedules.filter((x) => x !== s)
      : [...form.serviceSchedules, s];
    updateForm({ serviceSchedules: next });
  };

  return (
    <SectionCard title="Disponibilidad">
      <Stack divider={<Divider flexItem />}>
        <AvailRow
          label="POS · Terminal"
          sub="Visible en el mostrador"
          checked={form.availability.pos}
          onChange={(v) => setChannel('pos', v)}
        />
        <AvailRow
          label="Tienda online"
          sub="Pedidos por web"
          checked={form.availability.online}
          onChange={(v) => setChannel('online', v)}
        />
        <AvailRow
          label="Kiosko / QR"
          sub="PWA para mesa"
          checked={form.availability.kiosk}
          onChange={(v) => setChannel('kiosk', v)}
        />
      </Stack>
      <Box sx={{ mt: 2, pt: 2, borderTop: 1, borderColor: 'divider' }}>
        <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
          Horario
        </Typography>
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
          {SERVICE_SCHEDULES.map((s) => {
            const selected = form.serviceSchedules.includes(s);
            return (
              <Chip
                key={s}
                label={SCHEDULE_LABELS[s]}
                clickable
                onClick={() => toggleSchedule(s)}
                color={selected ? 'primary' : 'default'}
                variant={selected ? 'filled' : 'outlined'}
                size="small"
              />
            );
          })}
        </Stack>
      </Box>
    </SectionCard>
  );
}

function AvailRow({
  label,
  sub,
  checked,
  onChange,
}: {
  label: string;
  sub: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <Stack direction="row" spacing={2} alignItems="center" sx={{ py: 1 }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontWeight: 600 }}>{label}</Typography>
        <Typography variant="body2" color="text.secondary">
          {sub}
        </Typography>
      </Box>
      <Switch checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </Stack>
  );
}

interface ImageCardProps {
  imageUrl: string;
  uploading: boolean;
  uploadError: string | null;
  fileInputRef: React.MutableRefObject<HTMLInputElement | null>;
  onPick: (file: File) => void;
  onRemove: () => void;
}

function ImageCard({
  imageUrl,
  uploading,
  uploadError,
  fileInputRef,
  onPick,
  onRemove,
}: ImageCardProps) {
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onPick(file);
    }
    e.target.value = '';
  };

  return (
    <SectionCard title="Imagen" subtitle="JPG · PNG · WEBP · máx 2 MB">
      {imageUrl ? (
        <Stack spacing={1.5}>
          <Box
            component="img"
            src={imageUrl}
            alt="Imagen del producto"
            sx={{
              width: '100%',
              aspectRatio: '4/3',
              objectFit: 'cover',
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'divider',
            }}
          />
          <Stack direction="row" spacing={1}>
            <Button
              size="small"
              variant="outlined"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              Cambiar
            </Button>
            <Button size="small" color="error" onClick={onRemove} disabled={uploading}>
              Remover
            </Button>
          </Stack>
        </Stack>
      ) : (
        <Box
          component="button"
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          sx={{
            all: 'unset',
            cursor: uploading ? 'default' : 'pointer',
            display: 'grid',
            placeItems: 'center',
            width: '100%',
            aspectRatio: '4/3',
            borderRadius: 2,
            border: '1.5px dashed',
            borderColor: 'divider',
            bgcolor: 'action.hover',
            color: 'text.secondary',
            textAlign: 'center',
            p: 2,
            '&:focus-visible': {
              outline: '2px solid',
              outlineColor: 'primary.main',
              outlineOffset: 2,
            },
          }}
        >
          <Stack spacing={1} alignItems="center">
            <Upload size={22} aria-hidden />
            <Typography variant="body2" sx={{ fontWeight: 550 }}>
              {uploading ? 'Subiendo…' : 'Arrastra o haz clic para subir'}
            </Typography>
            <Typography
              variant="caption"
              sx={{
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                color: 'text.disabled',
              }}
            >
              JPG / PNG / WEBP · &lt; 2 MB
            </Typography>
          </Stack>
        </Box>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept={UPLOAD_MIME.join(',')}
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />
      {uploadError && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {uploadError}
        </Alert>
      )}
    </SectionCard>
  );
}

interface KitchenStationsCardProps {
  stations: KitchenStation[] | null;
  error: string | null;
  selected: string[];
  onToggle: (id: string) => void;
  branchId: string | null;
}

function KitchenStationsCard({
  stations,
  error,
  selected,
  onToggle,
  branchId,
}: KitchenStationsCardProps) {
  if (stations === null && !error) {
    return (
      <SectionCard title="Ruta en cocina">
        <Stack spacing={1}>
          <Skeleton variant="rounded" width={80} height={28} />
          <Skeleton variant="rounded" width={60} height={28} />
        </Stack>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Ruta en cocina" subtitle="A qué estación se envía al disparar.">
      {error && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {stations && stations.length === 0 ? (
        <EmptyState
          title="Sin estaciones configuradas"
          subtitle="No hay estaciones de cocina configuradas para esta sucursal."
          action={
            branchId ? (
              <Button
                size="small"
                variant="outlined"
                component="a"
                href={`/kitchen-stations?branchId=${encodeURIComponent(branchId)}`}
              >
                Configurar estaciones
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
          {stations?.map((s) => {
            const isSelected = selected.includes(s._id);
            return (
              <Chip
                key={s._id}
                label={s.name}
                clickable
                onClick={() => onToggle(s._id)}
                color={isSelected ? 'primary' : 'default'}
                variant={isSelected ? 'filled' : 'outlined'}
                size="small"
              />
            );
          })}
        </Stack>
      )}
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

function SectionCard({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card variant="outlined">
      <CardHeader
        title={title}
        subheader={subtitle}
        action={action}
        titleTypographyProps={{ variant: 'subtitle1', sx: { fontWeight: 650 } }}
        subheaderTypographyProps={{ variant: 'body2' }}
      />
      <Divider />
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function AdornmentText({ children }: { children: ReactNode }) {
  return (
    <Typography
      component="span"
      sx={{
        color: 'text.secondary',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: 14,
      }}
    >
      {children}
    </Typography>
  );
}

function FormSkeleton() {
  return (
    <Box>
      <Skeleton variant="text" width={240} height={40} sx={{ mb: 2 }} />
      <Stack spacing={3}>
        {[1, 2, 3].map((n) => (
          <Skeleton key={n} variant="rounded" height={180} />
        ))}
      </Stack>
    </Box>
  );
}
