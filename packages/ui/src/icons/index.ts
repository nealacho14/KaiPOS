// Canonical icon surface for the design system. `lucide-react` is the source;
// re-exported here so consumer code never imports `lucide-react` directly.
// Adding the `./icons` subpath gives consumers an explicit place to look while
// the legacy `@kaipos/ui` root export stays intact for back-compat.
export {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronRight,
  Edit,
  Eye,
  EyeOff,
  GripVertical,
  Image as ImageIcon,
  Inbox,
  LayoutDashboard,
  LogOut,
  Menu as MenuIcon,
  Package,
  Plus,
  Radio,
  Star,
  Trash2,
  Upload,
  Users as UsersIcon,
  X,
  type LucideIcon,
  type LucideProps,
} from 'lucide-react';
