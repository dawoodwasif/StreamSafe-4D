# StreamSafe 4D Design Guidelines

## Design Approach
**Design System**: Tailwind + shadcn/ui with industrial dashboard principles, drawing inspiration from data-intensive platforms like Grafana, Datadog, and control room interfaces. Focus on information density, scannable hierarchies, and operational efficiency.

## Typography System

**Font Stack**: 
- Primary: Inter (via Google Fonts CDN) - exceptional readability for data displays
- Monospace: JetBrains Mono - for timestamps, IDs, numerical data

**Hierarchy**:
- Page Titles: text-2xl font-semibold
- Section Headers: text-lg font-medium
- Card Titles: text-base font-medium
- Body/Data: text-sm font-normal
- Small Labels/Meta: text-xs font-normal
- Numerical Metrics: text-3xl font-bold (large metrics), text-xl font-semibold (card metrics)

## Layout System

**Spacing Primitives**: Tailwind units of 2, 4, 6, and 8 for consistency
- Component padding: p-4 or p-6
- Section gaps: gap-4 or gap-6
- Page margins: Consistent px-6 py-4 for main content areas
- Card spacing: space-y-4 internally

**Grid Layouts**:
- Dashboard metrics: 4-column grid (grid-cols-1 md:grid-cols-2 lg:grid-cols-4)
- Zone/Worker cards: 3-column grid (grid-cols-1 md:grid-cols-2 lg:grid-cols-3)
- Analytics widgets: 2-column grid (grid-cols-1 lg:grid-cols-2)
- Responsive: Always collapse to single column on mobile

## Core Layout Structure

**Top Navigation Bar**: 
- Height: h-16
- Fixed position with z-index for persistence
- Contains: Logo, breadcrumb navigation, notification bell, user profile
- Horizontal padding: px-6

**Sidebar Navigation**:
- Width: w-64 on desktop, collapsible to w-16 (icon-only)
- Fixed left position
- Nav items with icons (from Heroicons - outline style)
- Active state: Subtle background treatment
- Group spacing: space-y-1 for nav items

**Main Content Area**:
- Left margin to account for sidebar (ml-64 or ml-16)
- Top padding for fixed header (pt-16)
- Content wrapper: max-w-7xl mx-auto px-6 py-8

## Component Library

### Metric Cards
- Structure: Icon + Label + Value + Trend indicator
- Layout: Vertical stack (flex-col) with space-y-2
- Padding: p-6
- Border treatment: border with rounded-lg
- Value prominence: Large bold numbers (text-3xl font-bold)

### Risk Badges
- Inline badges with rounded-full px-3 py-1
- Typography: text-xs font-semibold uppercase tracking-wide
- Four states: CRITICAL, HIGH, MEDIUM, LOW (no color specified)

### Zone Cards
- Card structure: Header (zone name + status badge) + Metrics grid + Quick actions
- Internal spacing: p-4 with space-y-3
- Metrics: 2-column grid for key stats
- Border treatment: rounded-lg border

### Alert Table/Console
- Sticky header row with sort indicators
- Row height: Comfortable py-3 for scanability
- Column widths: Timestamp (fixed w-40), Zone (w-32), Worker (w-32), Risk (w-24), rest flexible
- Pagination: Bottom-aligned with items-per-page selector
- Search/Filter bar: mb-4 with flex layout for multiple filter controls

### Chart Containers
- Consistent aspect ratio: aspect-video for time-series charts
- Padding: p-4 around chart area
- Title treatment: text-base font-medium mb-4
- Height constraints: h-64 for dashboard widgets, h-96 for detail pages

### Data Visualizations
- **Line Charts**: Risk trends over time (use recharts library)
- **Bar Charts**: Alert distribution by zone/worker (stacked for severity breakdown)
- **Donut Charts**: Behavior classification percentages
- **Heatmaps**: Time-of-day alert patterns (use recharts with custom cell rendering)
- All charts: Responsive, tooltips on hover, axis labels at text-xs

## Page-Specific Layouts

### Dashboard Page
- 4-metric card row at top (grid-cols-4)
- Zone risk timeline section: Full-width chart with h-80
- Two-column split: Zone health cards (left, 8 columns) + Top risky workers (right, 4 columns)
- Vertical spacing between sections: space-y-8

### Zones/Workers Detail Pages
- Header: Large title + status metrics in flex row
- Timeline visualization: Full-width, h-64
- 2-column grid below: Alert distribution (left) + Behavior breakdown (right)
- Bottom section: Detailed alert table with filters

### Alerts Console
- Filter bar: Fixed at top with shadow
- Table: Striped rows (even/odd treatment) for scanability
- Auto-refresh toggle: Top-right corner with switch component
- Pagination controls: Sticky bottom

### Analytics Page
- Dashboard grid: 2-column layout (lg:grid-cols-2)
- Each widget: Self-contained card with title, chart, and legend
- Heatmap: Full-width for better readability
- Comparative charts: Side-by-side for zone comparisons

### Settings Page
- Form layout: Single column with max-w-2xl
- Section groupings with space-y-6
- Threshold sliders: Full-width with numerical input alongside
- Toggle switches for feature flags
- Kafka info: Read-only fields in card format

## Icons & Assets

**Icon Library**: Heroicons (outline style) via CDN
- Navigation icons: 20×20 (w-5 h-5)
- Metric card icons: 24×24 (w-6 h-6)
- Alert indicators: 16×16 (w-4 h-4)

**Key Icons**:
- Dashboard: ChartBarIcon
- Zones: MapIcon
- Workers: UsersIcon
- Alerts: BellAlertIcon
- Analytics: ChartPieIcon
- Settings: CogIcon

## Responsive Behavior

**Breakpoints**:
- Mobile (base): Single column, collapsed sidebar (drawer), stacked metrics
- Tablet (md): 2-column grids, persistent sidebar
- Desktop (lg): Full multi-column layouts, expanded data tables

**Mobile Optimizations**:
- Hide secondary metrics, show only critical data
- Horizontal scroll for wide tables
- Bottom navigation bar alternative for small screens
- Collapsible filter sections

## Accessibility

- Focus indicators: ring-2 ring-offset-2 on interactive elements
- Skip navigation link for keyboard users
- ARIA labels on all icon-only buttons
- Table headers with scope attributes
- Form labels explicitly associated with inputs
- Minimum touch target: 44×44px for mobile interactions

## Animation Principles

**Use Sparingly**:
- Page transitions: None (instant for data monitoring context)
- Data updates: Subtle pulse effect (duration-200) on new alert indicators only
- Chart transitions: Smooth line/bar animations (duration-300) on initial render
- Loading states: Simple spinner, no elaborate animations
- Avoid: Hover animations, sliding panels, bounce effects