import { useMemo, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  Bell,
  BookOpen,
  Calculator,
  Check,
  ChevronDown,
  CircleDollarSign,
  Edit3,
  GraduationCap,
  Heart,
  Laptop,
  LayoutGrid,
  List,
  MapPin,
  Menu,
  Plus,
  Search,
  Send,
  ShieldCheck,
  ShoppingBag,
  Sofa,
  Star,
  Tag,
  Trash2,
  TrendingUp,
  UserRound,
  X,
} from "lucide-react";

import campusMarketplace from "../assets/campus-marketplace.jpg";
import { handleAppLink } from "../navigation";

const categories = [
  ["All", Tag],
  ["Academic Books", BookOpen],
  ["Calculators", Calculator],
  ["Laptops & Electronics", Laptop],
  ["Furniture", Sofa],
  ["Hostel Items", ShoppingBag],
  ["Lab Equipment", BarChart3],
  ["Course Materials", BookOpen],
  ["Other", Tag],
];

const categoryCounts = [
  ["Academic Books", 142],
  ["Calculators", 38],
  ["Laptops & Electronics", 95],
  ["Furniture", 67],
  ["Hostel Items", 84],
  ["Lab Equipment", 29],
  ["Other", 56],
];

const initialProducts = [
  { id: 1, title: "Database Management Systems Book", category: "Academic Books", condition: "Used - Good", type: "For Sale", price: "Rs. 2,500", rating: "4.8", reviews: 12, seller: "Kasun Perera", score: 94, date: "Aug 18, 2026", status: "Active", position: "center" },
  { id: 2, title: "Casio fx-991EX Scientific Calculator", category: "Calculators", condition: "Like New", type: "For Rent", price: "Rs. 300 / week", rating: "4.9", reviews: 8, seller: "Nethmi Silva", score: 98, date: "Aug 16, 2026", status: "Active", position: "right" },
  { id: 3, title: "Engineering Mathematics Vol. 1 & 2", category: "Academic Books", condition: "Used - Good", type: "Exchange", price: "Exchange", rating: "4.5", reviews: 4, seller: "Kasun Perera", score: 94, date: "Aug 12, 2026", status: "Active", position: "left" },
  { id: 4, title: "Study Lamp - LED Adjustable", category: "Hostel Items", condition: "Like New", type: "For Sale", price: "Rs. 1,800", rating: "4.6", reviews: 9, seller: "Amaya Silva", score: 87, date: "Aug 10, 2026", status: "Sold", position: "right" },
  { id: 5, title: "Digital Microscope 40x-1000x", category: "Lab Equipment", condition: "Used - Good", type: "For Rent", price: "Rs. 500 / week", rating: "4.7", reviews: 5, seller: "Dinesh Kumar", score: 97, date: "Aug 08, 2026", status: "Active", position: "center" },
  { id: 6, title: "Operating Systems Course Notes - CS3502", category: "Course Materials", condition: "Used - Good", type: "For Sale", price: "Rs. 600", rating: "4.4", reviews: 18, seller: "Nimesha Fernando", score: 76, date: "Aug 03, 2026", status: "Active", position: "left" },
];

const reviews = [
  { id: 1, title: "Database Management Systems Book", rating: 5, date: "Aug 18, 2026", copy: "The book was exactly as described and in great condition. Smooth handover on campus!", seller: "Kasun Perera", helpful: 8 },
  { id: 2, title: "Casio fx-991EX Scientific Calculator", rating: 5, date: "Jul 29, 2026", copy: "Very responsive seller and the calculator worked perfectly for my exams.", seller: "Nethmi Silva", helpful: 5 },
  { id: 3, title: "Hostel Desk Organizer", rating: 4, date: "Jul 12, 2026", copy: "Useful item and fair price. Pickup was quick and convenient.", seller: "Amaya Silva", helpful: 3 },
];

const typeStyles = { "For Sale": "bg-amber-50 text-amber-700", "For Rent": "bg-violet-50 text-violet-700", Exchange: "bg-sky-50 text-sky-700" };

export default function ProductDashboardPage() {
  const [view, setView] = useState("Marketplace");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [listingType, setListingType] = useState("All Types");
  const [condition, setCondition] = useState("All");
  const [sort, setSort] = useState("Newest");
  const [liked, setLiked] = useState([]);
  const [products, setProducts] = useState(initialProducts);
  const [layout, setLayout] = useState("grid");
  const [profileOpen, setProfileOpen] = useState(false);
  const [productModal, setProductModal] = useState(false);
  const [deleteProduct, setDeleteProduct] = useState(null);

  const filteredProducts = useMemo(() => {
    const result = products.filter((product) => {
      const matchesQuery = product.title.toLowerCase().includes(query.toLowerCase());
      const matchesCategory = category === "All" || product.category === category;
      const matchesType = listingType === "All Types" || product.type === listingType;
      const matchesCondition = condition === "All" || product.condition.includes(condition);
      return matchesQuery && matchesCategory && matchesType && matchesCondition;
    });
    if (sort === "Top Rated") return [...result].sort((a, b) => Number(b.rating) - Number(a.rating));
    if (sort === "Price: Low to High") return [...result].sort((a, b) => Number(a.price.replace(/[^0-9]/g, "")) - Number(b.price.replace(/[^0-9]/g, "")));
    return result;
  }, [category, condition, listingType, products, query, sort]);

  function resetFilters() {
    setCategory("All");
    setListingType("All Types");
    setCondition("All");
    setQuery("");
  }

  function toggleLiked(id) {
    setLiked((items) => items.includes(id) ? items.filter((item) => item !== id) : [...items, id]);
  }

  function confirmDelete() {
    setProducts((items) => items.filter((item) => item.id !== deleteProduct.id));
    setDeleteProduct(null);
  }

  return (
    <main className="min-h-screen bg-[#f5f8f6] text-[#173126]">
      <Header view={view} setView={setView} query={query} setQuery={setQuery} profileOpen={profileOpen} setProfileOpen={setProfileOpen} onList={() => setProductModal(true)} />
      {view === "Marketplace" && (
        <MarketplaceView query={query} setQuery={setQuery} category={category} setCategory={setCategory} listingType={listingType} setListingType={setListingType} condition={condition} setCondition={setCondition} sort={sort} setSort={setSort} filteredProducts={filteredProducts} liked={liked} toggleLiked={toggleLiked} resetFilters={resetFilters} />
      )}
      {view === "Categories" && <CategoriesView setView={setView} setCategory={setCategory} />}
      {view === "My Products" && <ProductsView products={products} layout={layout} setLayout={setLayout} onAdd={() => setProductModal(true)} onDelete={setDeleteProduct} />}
      {view === "My Reviews" && <ReviewsView />}
      <Footer />
      {productModal && <ProductModal onClose={() => setProductModal(false)} onSave={(product) => { setProducts((items) => [{ ...product, id: Date.now(), date: "Just now", status: "Active" }, ...items]); setProductModal(false); }} />}
      {deleteProduct && <DeleteModal product={deleteProduct} onClose={() => setDeleteProduct(null)} onConfirm={confirmDelete} />}
    </main>
  );
}

function Header({ view, setView, query, setQuery, profileOpen, setProfileOpen, onList }) {
  return <header className="border-b border-[#e2e9e1] bg-white px-4 py-3 sm:px-8"><nav className="mx-auto flex max-w-7xl items-center gap-5"><a aria-label="CampusCycle home" className="flex shrink-0 items-center gap-2 text-lg font-black tracking-[-.04em] text-[#173126]" href="/" onClick={handleAppLink("/")}><span className="grid size-9 place-items-center rounded-xl bg-[#08a649] text-white"><ShoppingBag size={18} /></span><span>Campus<span className="text-[#08a649]">Cycle</span></span></a><div className="hidden items-center gap-1 lg:flex">{["Marketplace", "Categories", "My Products", "My Reviews"].map((item) => <button className={`rounded-lg px-3 py-2 text-xs font-bold ${view === item ? "bg-[#e8f7eb] text-[#15803d]" : "text-[#65736a] hover:bg-[#f2f6f2]"}`} key={item} onClick={() => setView(item)} type="button">{item}</button>)}</div><div className="ml-auto flex items-center gap-2"><label className="hidden h-9 w-44 items-center gap-2 rounded-xl bg-[#f4f7f5] px-3 text-[#90a097] xl:flex"><Search size={15} /><input aria-label="Global search" className="w-full bg-transparent text-xs outline-none" onChange={(event) => setQuery(event.target.value)} placeholder="Search..." value={query} /></label><button aria-label="Notifications" className="grid size-9 place-items-center rounded-xl text-[#66766d] hover:bg-[#f1f7f2]" type="button"><Bell size={17} /></button><button className="hidden items-center gap-1.5 rounded-xl bg-[#08a649] px-4 py-2 text-xs font-bold text-white hover:bg-[#078b3e] sm:inline-flex" onClick={onList} type="button"><Plus size={15} /> List Item</button><div className="relative"><button aria-label="Open profile menu" className="flex items-center gap-1 rounded-xl p-1 hover:bg-[#f1f7f2]" onClick={() => setProfileOpen(!profileOpen)} type="button"><span className="grid size-8 place-items-center rounded-full bg-[#f4c8a4] text-[10px] font-bold text-[#70401f]">KP</span><ChevronDown size={14} /></button>{profileOpen && <div className="absolute right-0 top-11 z-20 w-40 rounded-xl border border-[#e0e9e1] bg-white p-2 text-xs shadow-xl"><button className="flex w-full gap-2 rounded-lg px-3 py-2 text-left hover:bg-[#f1f7f2]" onClick={() => setView("My Products")} type="button"><UserRound size={14} /> My profile</button><a className="flex gap-2 rounded-lg px-3 py-2 text-[#a33d3d] hover:bg-red-50" href="/login" onClick={handleAppLink("/login")}>Sign out</a></div>}</div><button aria-label="Open navigation menu" className="grid size-9 place-items-center rounded-xl lg:hidden" type="button"><Menu size={18} /></button></div></nav></header>;
}

function MarketplaceView({ query, setQuery, category, setCategory, listingType, setListingType, condition, setCondition, sort, setSort, filteredProducts, liked, toggleLiked, resetFilters }) {
  return <><section className="mx-auto max-w-7xl px-4 pt-5 sm:px-8"><div className="rounded-2xl bg-gradient-to-r from-[#08a649] to-[#04b978] px-6 py-8 text-white shadow-[0_18px_45px_rgba(8,166,73,.16)] sm:px-10"><span className="rounded-full bg-white/15 px-3 py-1.5 text-[10px] font-bold tracking-[.12em]">CAMPUS MARKETPLACE</span><h1 className="mt-4 max-w-2xl text-3xl font-black leading-tight sm:text-4xl">Buy, sell, rent &amp; exchange with fellow students.</h1><p className="mt-3 text-sm text-white/90">♻ Give your unused items a new life — sustainably.</p><div className="mt-6 flex max-w-2xl rounded-xl bg-white p-1.5"><Search className="m-2.5 shrink-0 text-[#9aa9a0]" size={18} /><input aria-label="Search marketplace" className="min-w-0 flex-1 bg-transparent px-1 text-xs text-[#173126] outline-none" onChange={(event) => setQuery(event.target.value)} placeholder="Search books, calculators, laptops, furniture..." value={query} /><button className="rounded-lg bg-[#079344] px-4 py-2.5 text-xs font-bold text-white" type="button">Search</button></div></div></section><section className="mx-auto max-w-7xl overflow-x-auto px-4 py-4 sm:px-8"><div className="flex min-w-max gap-2">{categories.map(([name, Icon]) => <button className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-[11px] font-bold ${category === name ? "bg-[#08a649] text-white" : "bg-white text-[#62736a] shadow-sm"}`} key={name} onClick={() => setCategory(name)} type="button"><Icon size={14} />{name}</button>)}</div></section><section className="mx-auto grid max-w-7xl gap-5 px-4 pb-10 sm:px-8 lg:grid-cols-[184px_1fr]"><FilterSidebar category={category} setCategory={setCategory} listingType={listingType} setListingType={setListingType} condition={condition} setCondition={setCondition} resetFilters={resetFilters} /><div><div className="mb-4 flex items-center justify-between"><p className="text-xs text-[#7b897f]"><strong className="text-[#173126]">{filteredProducts.length || 8} products found</strong></p><label className="flex items-center gap-2 text-[11px] text-[#758279]">Sort:<select aria-label="Sort products" className="rounded-lg border border-[#dce6dd] bg-white px-2.5 py-2 font-bold text-[#33443a]" onChange={(event) => setSort(event.target.value)} value={sort}><option>Newest</option><option>Price: Low to High</option><option>Top Rated</option></select></label></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{filteredProducts.map((product) => <ProductCard key={product.id} product={product} liked={liked.includes(product.id)} onLike={() => toggleLiked(product.id)} />)}</div>{filteredProducts.length === 0 && <div className="rounded-2xl border border-dashed border-[#cbdacf] bg-white p-12 text-center text-sm text-[#758279]">No products match these filters.</div>}</div></section></>;
}

function FilterSidebar({ category, setCategory, listingType, setListingType, condition, setCondition, resetFilters }) {
  return <aside className="rounded-2xl border border-[#dce7df] bg-white p-4"><h2 className="text-xs font-bold">Category</h2><button className={`mt-4 flex w-full justify-between rounded-lg px-3 py-2 text-[11px] font-bold ${category === "All" ? "bg-[#edfbf1] text-[#078b3e]" : "text-[#516158]"}`} onClick={() => setCategory("All")} type="button">All Categories</button>{categoryCounts.map(([name, count]) => <button className={`mt-1 flex w-full justify-between rounded-lg px-3 py-2 text-[11px] ${category === name ? "bg-[#edfbf1] font-bold text-[#078b3e]" : "text-[#516158]"}`} key={name} onClick={() => setCategory(name)} type="button"><span>{name}</span><span className="text-[10px] text-[#a0aaa3]">{count}</span></button>)}<FilterChoices label="Listing Type" options={["All Types", "For Sale", "For Rent", "Exchange"]} value={listingType} onChange={setListingType} /><FilterChoices label="Condition" options={["All", "New", "Like New", "Good", "Fair"]} value={condition} onChange={setCondition} /><div className="mt-5 border-t border-[#edf1ed] pt-4"><h3 className="text-[11px] font-bold">Price Range</h3><div className="mt-3 flex gap-2"><input aria-label="Minimum price" className="w-1/2 rounded-lg border border-[#dce6dd] px-2.5 py-2 text-[11px] outline-none focus:border-[#08a649]" placeholder="Min" /><input aria-label="Maximum price" className="w-1/2 rounded-lg border border-[#dce6dd] px-2.5 py-2 text-[11px] outline-none focus:border-[#08a649]" placeholder="Max" /></div></div><button className="mt-4 w-full rounded-lg border border-[#cbe1cf] py-2.5 text-[11px] font-bold text-[#168044]" onClick={resetFilters} type="button">Reset Filters</button></aside>;
}

function FilterChoices({ label, options, value, onChange }) { return <div className="mt-5 border-t border-[#edf1ed] pt-4"><h3 className="text-[11px] font-bold">{label}</h3>{options.map((option) => <label className={`mt-2 flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] ${value === option ? "bg-[#edfbf1] font-bold text-[#078b3e]" : "text-[#516158]"}`} key={option}><input checked={value === option} className="accent-[#08a649]" name={label} onChange={() => onChange(option)} type="radio" />{option}</label>)}</div>; }

function ProductCard({ product, liked, onLike }) { return <article className="overflow-hidden rounded-2xl border border-[#dfe8e1] bg-white shadow-[0_8px_24px_rgba(26,61,39,.04)]"><div className="relative h-36 overflow-hidden bg-[#dceee3]"><img alt="" className={`size-full object-cover object-${product.position}`} src={campusMarketplace} /><div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" /><span className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-[10px] font-bold ${typeStyles[product.type]}`}>{product.type === "Exchange" ? "🤝" : product.type === "For Rent" ? "🔄" : "🏷️"} {product.type}</span>{product.type === "For Rent" && <strong className="absolute bottom-3 left-3 text-sm text-white">{product.price}</strong>}<button aria-label={`${liked ? "Remove" : "Add"} ${product.title} wishlist`} className={`absolute right-3 top-3 grid size-8 place-items-center rounded-full bg-white/90 ${liked ? "text-red-500" : "text-[#829087]"}`} onClick={onLike} type="button"><Heart fill={liked ? "currentColor" : "none"} size={15} /></button></div><div className="p-3.5"><div className="flex items-center justify-between gap-2"><span className="text-[10px] text-[#39705a]">{product.category}</span><span className="rounded-full bg-[#edf8ef] px-2 py-1 text-[10px] font-bold text-[#25724a]">{product.condition}</span></div><h3 className="mt-2 min-h-10 text-sm font-bold leading-5">{product.title}</h3><div className="mt-1 flex items-center gap-1 text-[11px] text-[#758279]"><Star className="fill-[#f5b83d] text-[#f5b83d]" size={13} /><strong>{product.rating}</strong> ({product.reviews})</div><div className="mt-2 text-base font-black text-[#168044]">{product.type === "For Rent" ? "" : product.price}</div><div className="mt-3 border-t border-[#edf1ed] pt-3"><div className="flex items-center gap-2"><span className="grid size-7 place-items-center rounded-full bg-[#e1f1e5] text-[9px] font-bold text-[#16723d]">{product.seller.split(" ").map((part) => part[0]).join("")}</span><span className="min-w-0 flex-1 truncate text-[10px] font-semibold">{product.seller}</span><span className="rounded-full border border-[#b9e9c4] px-1.5 py-1 text-[10px] font-bold text-[#168044]">{product.score}</span></div><button className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-[#08a649] py-2.5 text-[11px] font-bold text-white hover:bg-[#078b3e]" type="button">View Details <ArrowRight size={13} /></button></div></div></article>; }

function CategoriesView({ setView, setCategory }) { return <PageShell eyebrow="Explore the marketplace" title="Everything you need for campus life."><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[["8", "Total Listings", ShoppingBag], ["9", "Categories", Tag], ["126", "Active Sellers", UserRound], ["14", "Universities", GraduationCap]].map(([value, label, Icon]) => <MetricCard icon={Icon} key={label} label={label} value={value} />)}</div><div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{categoryCounts.concat([["Course Materials", 73], ["Laptops & Electronics", 95]]).map(([name, count], index) => { const Icon = categories.find(([label]) => label === name)?.[1] || Tag; return <article className="group rounded-2xl border border-[#dfe8e1] bg-white p-5 transition hover:-translate-y-1 hover:shadow-lg" key={`${name}-${index}`}><span className="grid size-11 place-items-center rounded-xl bg-[#e9f8ed] text-[#168044]"><Icon size={20} /></span><h3 className="mt-5 font-bold">{name}</h3><p className="mt-1 text-xs text-[#809087]">{count} items available</p><button className="mt-5 inline-flex items-center gap-1 text-xs font-bold text-[#168044]" onClick={() => { setCategory(name); setView("Marketplace"); }} type="button">Browse <ArrowRight size={14} /></button></article>; })}</div><div className="mt-8 flex flex-col justify-between gap-4 rounded-2xl bg-[#0b8f45] p-7 text-white sm:flex-row sm:items-center"><div><p className="text-xs font-bold uppercase tracking-[.13em] text-emerald-100">Small actions, real impact</p><h2 className="mt-2 text-2xl font-black">Trade sustainably with your campus.</h2></div><button className="inline-flex items-center gap-2 self-start rounded-xl bg-white px-4 py-3 text-xs font-bold text-[#08743a]" onClick={() => setView("Marketplace")} type="button">Start browsing <ArrowRight size={15} /></button></div></PageShell>; }

function ProductsView({ products, layout, setLayout, onAdd, onDelete }) { return <PageShell eyebrow="Seller workspace" title="Manage your products."><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[[products.length, "Total Products", ShoppingBag], [products.filter((item) => item.status === "Active").length, "Active Listings", TrendingUp], ["03", "Rented Out", CircleDollarSign], ["4.8", "Average Rating", Star]].map(([value, label, Icon]) => <MetricCard icon={Icon} key={label} label={label} value={value} />)}</div><div className="mt-8 flex items-center justify-between"><div><h2 className="text-xl font-black">Your listings</h2><p className="mt-1 text-xs text-[#7d8c83]">Keep your campus inventory fresh.</p></div><div className="flex items-center gap-2"><div className="flex rounded-lg border border-[#dce7df] bg-white p-1"><button aria-label="Grid view" className={`rounded-md p-2 ${layout === "grid" ? "bg-[#e8f7eb] text-[#168044]" : "text-[#819087]"}`} onClick={() => setLayout("grid")} type="button"><LayoutGrid size={15} /></button><button aria-label="List view" className={`rounded-md p-2 ${layout === "list" ? "bg-[#e8f7eb] text-[#168044]" : "text-[#819087]"}`} onClick={() => setLayout("list")} type="button"><List size={15} /></button></div><button className="inline-flex items-center gap-1.5 rounded-lg bg-[#08a649] px-3 py-2.5 text-[11px] font-bold text-white" onClick={onAdd} type="button"><Plus size={14} /> Add Product</button></div></div>{layout === "list" ? <div className="mt-4 overflow-x-auto rounded-2xl border border-[#dfe8e1] bg-white"><table className="w-full min-w-[700px] text-left text-xs"><thead className="border-b border-[#edf1ed] text-[10px] uppercase tracking-wider text-[#8c9991]"><tr><th className="p-4">Product</th><th>Category</th><th>Type</th><th>Price</th><th>Rating</th><th>Status</th><th className="p-4">Actions</th></tr></thead><tbody>{products.map((product) => <tr className="border-b border-[#f0f3f0] last:border-0" key={product.id}><td className="p-4"><div className="flex items-center gap-3"><img alt="" className="size-11 rounded-lg object-cover" src={campusMarketplace} /><div><strong>{product.title}</strong><p className="mt-1 text-[10px] text-[#93a097]">{product.date}</p></div></div></td><td>{product.category}</td><td><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${typeStyles[product.type]}`}>{product.type}</span></td><td className="font-bold">{product.price}</td><td><Star className="mr-1 inline fill-[#f5b83d] text-[#f5b83d]" size={12} />{product.rating}</td><td><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${product.status === "Active" ? "bg-[#e9f8ed] text-[#168044]" : "bg-[#f2f3f2] text-[#7d8981]"}`}>{product.status}</span></td><td className="p-4"><div className="flex gap-1"><button aria-label={`Edit ${product.title}`} className="rounded-lg p-2 text-[#688077] hover:bg-[#eef8f0]" type="button"><Edit3 size={14} /></button><button aria-label={`Delete ${product.title}`} className="rounded-lg p-2 text-[#b05a5a] hover:bg-red-50" onClick={() => onDelete(product)} type="button"><Trash2 size={14} /></button></div></td></tr>)}</tbody></table></div> : <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{products.map((product) => <ProductCard key={product.id} product={product} liked={false} onLike={() => {}} />)}</div>}</PageShell>; }

function ReviewsView() { return <PageShell eyebrow="Your feedback" title="Reviews you have shared."><div className="grid gap-3 sm:grid-cols-3"><MetricCard icon={Star} label="Total Reviews" value={reviews.length} /><MetricCard icon={TrendingUp} label="Avg. Rating Given" value="4.7" /><MetricCard icon={ShieldCheck} label="Verified Purchases" value="100%" /></div><div className="mt-8 space-y-4">{reviews.map((review) => <article className="rounded-2xl border border-[#dfe8e1] bg-white p-5" key={review.id}><div className="flex flex-col gap-4 sm:flex-row"><img alt="" className="size-16 rounded-xl object-cover" src={campusMarketplace} /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-bold">{review.title}</h3><p className="mt-1 text-[11px] text-[#8b9990]">Purchased from {review.seller} · {review.date}</p></div><span className="inline-flex items-center gap-1 rounded-full bg-[#e9f8ed] px-2 py-1 text-[10px] font-bold text-[#168044]"><Check size={12} /> Verified purchase</span></div><div className="mt-3 flex gap-0.5 text-[#f5b83d]">{Array.from({ length: 5 }, (_, index) => <Star className={index < review.rating ? "fill-current" : "text-[#dbe3dd]"} key={index} size={15} />)}</div><p className="mt-3 text-sm leading-6 text-[#607169]">{review.copy}</p><div className="mt-4 flex items-center justify-between text-xs text-[#819087]"><span>Helpful? <strong className="text-[#168044]">{review.helpful}</strong> students said yes</span><div className="flex gap-3"><button className="font-bold text-[#168044]" type="button">Edit</button><button className="font-bold text-[#ae5c5c]" type="button">Delete</button></div></div></div></div></article>)}</div></PageShell>; }

function PageShell({ eyebrow, title, children }) { return <section className="mx-auto max-w-7xl px-4 py-8 sm:px-8"><div className="mb-7"><p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#278052]">{eyebrow}</p><h1 className="mt-2 text-3xl font-black tracking-[-.04em] text-[#173126]">{title}</h1></div>{children}</section>; }
function MetricCard({ icon: Icon, label, value }) { return <article className="rounded-2xl border border-[#dfe8e1] bg-white p-4"><div className="flex items-center justify-between"><span className="grid size-9 place-items-center rounded-xl bg-[#e9f8ed] text-[#168044]"><Icon size={17} /></span><TrendingUp className="text-[#a5c9ad]" size={15} /></div><p className="mt-4 text-2xl font-black">{value}</p><p className="mt-1 text-[11px] text-[#7e8c84]">{label}</p></article>; }
function Footer() { return <footer className="border-t border-[#e1e9e2] bg-white px-5 py-6 text-center text-[11px] text-[#87938a] sm:flex sm:items-center sm:justify-between sm:px-8"><strong className="text-[#168044]">CampusCycle</strong><span>Student Marketplace · Member 2 – Product Management + Reviews</span><span>♻ Trade sustainably. Help the campus community.</span></footer>; }

function ProductModal({ onClose, onSave }) {
  const [type, setType] = useState("For Sale");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Academic Books");
  const [price, setPrice] = useState("");
  return <Modal title="List a new product" onClose={onClose}><div className="space-y-5"><div><label className="text-xs font-bold">Basic Information</label><input className="mt-2 w-full rounded-xl border border-[#dce7df] px-3 py-3 text-sm outline-none focus:border-[#08a649]" onChange={(event) => setTitle(event.target.value)} placeholder="Product title" value={title} /></div><div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold">Category<select className="mt-2 w-full rounded-xl border border-[#dce7df] bg-white px-3 py-3 text-sm font-normal" onChange={(event) => setCategory(event.target.value)} value={category}>{categoryCounts.map(([name]) => <option key={name}>{name}</option>)}</select></label><label className="text-xs font-bold">Condition<select className="mt-2 w-full rounded-xl border border-[#dce7df] bg-white px-3 py-3 text-sm font-normal"><option>New</option><option>Like New</option><option>Good</option><option>Fair</option></select></label></div><div><label className="text-xs font-bold">Listing Type</label><div className="mt-2 grid grid-cols-3 gap-2">{["For Sale", "For Rent", "Exchange"].map((option) => <button className={`rounded-xl border p-3 text-xs font-bold ${type === option ? "border-[#08a649] bg-[#edfbf1] text-[#078b3e]" : "border-[#dce7df] text-[#697a70]"}`} key={option} onClick={() => setType(option)} type="button">{option}</button>)}</div></div>{type !== "Exchange" && <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold">{type === "For Rent" ? "Rental price" : "Price"}<input className="mt-2 w-full rounded-xl border border-[#dce7df] px-3 py-3 text-sm font-normal outline-none focus:border-[#08a649]" onChange={(event) => setPrice(event.target.value)} placeholder="Rs. 0" value={price} /></label>{type === "For Rent" && <label className="text-xs font-bold">Rental duration<select className="mt-2 w-full rounded-xl border border-[#dce7df] bg-white px-3 py-3 text-sm font-normal"><option>Per week</option><option>Per month</option><option>Per semester</option></select></label>}</div>}<div className="rounded-xl border-2 border-dashed border-[#c9dfcf] bg-[#f7fcf8] p-6 text-center"><Send className="mx-auto text-[#5aa66f]" size={22} /><p className="mt-2 text-xs font-bold">Drop product images here</p><p className="mt-1 text-[11px] text-[#8b9990]">PNG or JPG up to 5MB</p></div><label className="text-xs font-bold">Campus Location<input className="mt-2 w-full rounded-xl border border-[#dce7df] px-3 py-3 text-sm font-normal outline-none focus:border-[#08a649]" placeholder="e.g. Main Library" /></label></div><div className="mt-6 flex justify-end gap-2 border-t border-[#edf1ed] pt-4"><button className="rounded-xl px-4 py-2.5 text-xs font-bold text-[#708077]" onClick={onClose} type="button">Cancel</button><button className="rounded-xl bg-[#08a649] px-5 py-2.5 text-xs font-bold text-white disabled:opacity-50" disabled={!title} onClick={() => onSave({ title, category, type, price: price || "Exchange", condition: "New", rating: "New", reviews: 0, seller: "You", score: 100, position: "center" })} type="button">Publish Product</button></div></Modal>;
}
function DeleteModal({ product, onClose, onConfirm }) { return <Modal title="Delete Product?" onClose={onClose}><p className="text-sm leading-6 text-[#687870]">Are you sure you want to delete <strong className="text-[#173126]">{product.title}</strong>? This action cannot be undone.</p><div className="mt-6 flex justify-end gap-2"><button className="rounded-xl px-4 py-2.5 text-xs font-bold text-[#708077]" onClick={onClose} type="button">Cancel</button><button className="rounded-xl bg-[#b94d4d] px-4 py-2.5 text-xs font-bold text-white" onClick={onConfirm} type="button">Delete Product</button></div></Modal>; }
function Modal({ title, onClose, children }) { return <div className="fixed inset-0 z-50 grid place-items-center bg-[#09231d]/55 p-4 backdrop-blur-sm"><div aria-modal="true" className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl" role="dialog"><div className="flex items-center justify-between"><h2 className="text-xl font-black">{title}</h2><button aria-label="Close dialog" className="rounded-lg p-2 text-[#758279] hover:bg-[#f1f7f2]" onClick={onClose} type="button"><X size={18} /></button></div>{children}</div></div>; }
