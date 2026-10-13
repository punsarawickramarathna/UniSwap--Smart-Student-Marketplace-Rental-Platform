import { useCallback, useEffect, useMemo, useState } from "react";
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
  Image as ImageIcon,
  Laptop,
  LayoutGrid,
  List,
  LoaderCircle,
  LogOut,
  MapPin,
  Menu,
  Package,
  Plus,
  Search,
  ShieldCheck,
  ShoppingBag,
  Sofa,
  Star,
  Tag,
  Trash2,
  TrendingUp,
  UploadCloud,
  UserRound,
  X,
} from "lucide-react";

import campusMarketplace from "../assets/campus-marketplace.jpg";
import { useAuth } from "../context/AuthContext";
import { handleAppLink, navigate } from "../navigation";
import {
  createProduct,
  deleteProduct as apiDeleteProduct,
  getCategories,
  getProduct,
  getProducts,
  updateProduct as apiUpdateProduct,
  uploadProductImage,
} from "../services/products";
import {
  createReview,
  deleteReview as apiDeleteReview,
  getMyReviews,
  getProductReviews,
  updateReview as apiUpdateReview,
} from "../services/reviews";
import { getSellerReputation } from "../services/sellers";

const categoryIconMap = {
  "Academic Books": BookOpen,
  Calculators: Calculator,
  "Laptops & Electronics": Laptop,
  Furniture: Sofa,
  "Hostel Items": ShoppingBag,
  "Lab Equipment": BarChart3,
  "Course Materials": BookOpen,
  Other: Tag,
};

const typeStyles = {
  "For Sale": "bg-amber-50 text-amber-700 border-amber-200",
  "For Rent": "bg-violet-50 text-violet-700 border-violet-200",
  Exchange: "bg-sky-50 text-sky-700 border-sky-200",
  Buy: "bg-amber-50 text-amber-700 border-amber-200",
  Rent: "bg-violet-50 text-violet-700 border-violet-200",
};

export default function ProductDashboardPage({ initialView = "Marketplace" }) {
  const { user, logout } = useAuth();
  const [view, setView] = useState(initialView);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [listingType, setListingType] = useState("All Types");
  const [condition, setCondition] = useState("All");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [sort, setSort] = useState("Newest");
  const [liked, setLiked] = useState([]);
  const [layout, setLayout] = useState("grid");
  const [profileOpen, setProfileOpen] = useState(false);

  // Data states
  const [products, setProducts] = useState([]);
  const [myProducts, setMyProducts] = useState([]);
  const [categoriesList, setCategoriesList] = useState([]);
  const [myReviewsList, setMyReviewsList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);

  // Modals state
  const [productModal, setProductModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [deleteProduct, setDeleteProduct] = useState(null);
  const [activeProductDetail, setActiveProductDetail] = useState(null);

  const showToast = useCallback((message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // Fetch categories
  const loadCategories = useCallback(async () => {
    try {
      const data = await getCategories();
      setCategoriesList(data);
    } catch {
      // Use defaults if category endpoint not reachable
    }
  }, []);

  // Fetch marketplace products
  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let sortParam = "newest";
      if (sort === "Price: Low to High") sortParam = "price_asc";
      else if (sort === "Price: High to Low") sortParam = "price_desc";
      else if (sort === "Top Rated") sortParam = "top_rated";

      const params = {
        q: query || undefined,
        category: category !== "All" ? category : undefined,
        product_type: listingType !== "All Types" ? listingType : undefined,
        condition: condition !== "All" ? condition : undefined,
        min_price: minPrice ? parseFloat(minPrice) : undefined,
        max_price: maxPrice ? parseFloat(maxPrice) : undefined,
        sort: sortParam,
      };
      const res = await getProducts(params);
      setProducts(res.items || []);
    } catch (err) {
      setError("Failed to load products from server.");
    } finally {
      setLoading(false);
    }
  }, [category, condition, listingType, maxPrice, minPrice, query, sort]);

  // Fetch seller's own products
  const loadMyProducts = useCallback(async () => {
    if (!user?.id) return;
    try {
      const res = await getProducts({ seller_id: user.id });
      setMyProducts(res.items || []);
    } catch {
      // ignore
    }
  }, [user?.id]);

  // Fetch user reviews
  const loadMyReviews = useCallback(async () => {
    if (!user?.id) return;
    try {
      const res = await getMyReviews();
      setMyReviewsList(res.items || []);
    } catch {
      // ignore
    }
  }, [user?.id]);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    if (view === "Marketplace") {
      loadProducts();
    } else if (view === "My Products") {
      loadMyProducts();
    } else if (view === "My Reviews") {
      loadMyReviews();
    }
  }, [loadMyProducts, loadMyReviews, loadProducts, view]);

  function resetFilters() {
    setCategory("All");
    setListingType("All Types");
    setCondition("All");
    setMinPrice("");
    setMaxPrice("");
    setQuery("");
  }

  function toggleLiked(id) {
    setLiked((items) =>
      items.includes(id) ? items.filter((item) => item !== id) : [...items, id]
    );
  }

  async function handleConfirmDelete() {
    if (!deleteProduct) return;
    try {
      await apiDeleteProduct(deleteProduct.id);
      showToast("Product deleted successfully.");
      setDeleteProduct(null);
      loadMyProducts();
      loadProducts();
    } catch (err) {
      showToast(err.response?.data?.detail || "Failed to delete product.", "error");
    }
  }

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  function openAddModal() {
    if (!user?.id) {
      navigate("/login?returnTo=/marketplace");
      return;
    }
    setEditingProduct(null);
    setProductModal(true);
  }

  function openEditModal(prod) {
    setEditingProduct(prod);
    setProductModal(true);
  }

  return (
    <main className="min-h-screen bg-[#f5f8f6] text-[#173126]">
      {/* Toast Notification */}
      {toast && (
        <div
          role="status"
          className={`fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-2xl px-5 py-3 text-xs font-bold text-white shadow-xl transition-all ${
            toast.type === "error" ? "bg-red-600" : "bg-[#08a649]"
          }`}
        >
          {toast.type === "error" ? <X size={16} /> : <Check size={16} />}
          {toast.message}
        </div>
      )}

      {/* Global Header */}
      <Header
        view={view}
        setView={setView}
        query={query}
        setQuery={setQuery}
        profileOpen={profileOpen}
        setProfileOpen={setProfileOpen}
        onList={openAddModal}
        user={user}
        onLogout={handleLogout}
      />

      {/* Views */}
      {view === "Marketplace" && (
        <MarketplaceView
          query={query}
          setQuery={setQuery}
          category={category}
          setCategory={setCategory}
          listingType={listingType}
          setListingType={setListingType}
          condition={condition}
          setCondition={setCondition}
          minPrice={minPrice}
          setMinPrice={setMinPrice}
          maxPrice={maxPrice}
          setMaxPrice={setMaxPrice}
          sort={sort}
          setSort={setSort}
          categoriesList={categoriesList}
          filteredProducts={products}
          loading={loading}
          error={error}
          liked={liked}
          toggleLiked={toggleLiked}
          resetFilters={resetFilters}
          onSelectProduct={(p) => setActiveProductDetail(p)}
          onAdd={openAddModal}
        />
      )}

      {view === "Categories" && (
        <CategoriesView
          setView={setView}
          setCategory={setCategory}
          categoriesList={categoriesList}
          productsCount={products.length}
        />
      )}

      {view === "My Products" && (
        <ProductsView
          products={myProducts}
          layout={layout}
          setLayout={setLayout}
          onAdd={openAddModal}
          onEdit={openEditModal}
          onDelete={setDeleteProduct}
          onSelectProduct={(p) => setActiveProductDetail(p)}
          user={user}
        />
      )}

      {view === "My Reviews" && (
        <ReviewsView
          reviews={myReviewsList}
          user={user}
          onRefresh={loadMyReviews}
          showToast={showToast}
        />
      )}

      <Footer />

      {/* Add / Edit Product Modal */}
      {productModal && (
        <ProductModal
          initialProduct={editingProduct}
          categoriesList={categoriesList}
          onClose={() => {
            setProductModal(false);
            setEditingProduct(null);
          }}
          onSaved={() => {
            setProductModal(false);
            setEditingProduct(null);
            showToast(
              editingProduct
                ? "Product updated successfully."
                : "Product listed successfully."
            );
            loadProducts();
            loadMyProducts();
          }}
          showToast={showToast}
        />
      )}

      {/* Delete Product Confirmation Modal */}
      {deleteProduct && (
        <DeleteModal
          product={deleteProduct}
          onClose={() => setDeleteProduct(null)}
          onConfirm={handleConfirmDelete}
        />
      )}

      {/* Product Details Modal with Reviews */}
      {activeProductDetail && (
        <ProductDetailsModal
          product={activeProductDetail}
          user={user}
          onClose={() => setActiveProductDetail(null)}
          onProductUpdated={loadProducts}
          showToast={showToast}
        />
      )}
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/* Header Component                                                           */
/* -------------------------------------------------------------------------- */
function Header({
  view,
  setView,
  query,
  setQuery,
  profileOpen,
  setProfileOpen,
  onList,
  user,
  onLogout,
}) {
  const userInitials = user?.student_id
    ? user.student_id.slice(-2)
    : user?.email
    ? user.email.slice(0, 2).toUpperCase()
    : "ST";

  return (
    <header className="sticky top-0 z-40 border-b border-[#e2e9e1] bg-white/95 px-4 py-3 backdrop-blur-md sm:px-8">
      <nav className="mx-auto flex max-w-7xl items-center gap-5">
        <a
          aria-label="UniSwap home"
          className="flex shrink-0 items-center gap-2 text-lg font-black tracking-[-.04em] text-[#173126]"
          href="/marketplace"
          onClick={handleAppLink("/marketplace")}
        >
          <span className="grid size-9 place-items-center rounded-xl bg-[#08a649] text-white shadow-sm">
            <ShoppingBag size={18} />
          </span>
          <span>
            Uni<span className="text-[#08a649]">Swap</span>
          </span>
        </a>

        <div className="hidden items-center gap-1 lg:flex">
          {["Marketplace", "Categories", "My Products", "My Reviews"].map((item) => (
            <button
              className={`rounded-lg px-3 py-2 text-xs font-bold transition ${
                view === item
                  ? "bg-[#e8f7eb] text-[#15803d]"
                  : "text-[#65736a] hover:bg-[#f2f6f2]"
              }`}
              key={item}
              onClick={() => setView(item)}
              type="button"
            >
              {item}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <label className="hidden h-9 w-52 items-center gap-2 rounded-xl bg-[#f4f7f5] px-3 text-[#90a097] xl:flex">
            <Search size={15} />
            <input
              aria-label="Global search"
              className="w-full bg-transparent text-xs text-[#173126] outline-none placeholder:text-[#90a097]"
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search products..."
              value={query}
            />
          </label>

          <button
            aria-label="Notifications"
            className="grid size-9 place-items-center rounded-xl text-[#66766d] hover:bg-[#f1f7f2]"
            type="button"
          >
            <Bell size={17} />
          </button>

          <button
            className="hidden items-center gap-1.5 rounded-xl bg-[#08a649] px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-[#078b3e] sm:inline-flex"
            onClick={onList}
            type="button"
          >
            <Plus size={15} /> List Item
          </button>

          {user?.id ? (
            <div className="relative">
              <button
                aria-label="Open profile menu"
                className="flex items-center gap-1 rounded-xl p-1 hover:bg-[#f1f7f2]"
                onClick={() => setProfileOpen(!profileOpen)}
                type="button"
              >
                <span className="grid size-8 place-items-center rounded-full bg-[#d7f1e0] text-[11px] font-bold text-[#15803d]">
                  {userInitials}
                </span>
                <ChevronDown size={14} />
              </button>
              {profileOpen && (
                <div className="absolute right-0 top-11 z-50 w-48 rounded-xl border border-[#e0e9e1] bg-white p-2 text-xs shadow-xl">
                  <div className="border-b border-[#edf1ed] px-3 py-2 text-[#7c8b82]">
                    <p className="font-bold text-[#173126]">
                      {user.student_id || "Student Account"}
                    </p>
                    <p className="truncate text-[10px]">{user.email}</p>
                  </div>
                  <button
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-[#f1f7f2]"
                    onClick={() => {
                      setView("My Products");
                      setProfileOpen(false);
                    }}
                    type="button"
                  >
                    <Package size={14} /> My Products
                  </button>
                  <button
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-[#f1f7f2]"
                    onClick={() => {
                      setView("My Reviews");
                      setProfileOpen(false);
                    }}
                    type="button"
                  >
                    <Star size={14} /> My Reviews
                  </button>
                  <button
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[#a33d3d] hover:bg-red-50"
                    onClick={onLogout}
                    type="button"
                  >
                    <LogOut size={14} /> Sign out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <a
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#cce3d2] bg-white px-3.5 py-2 text-xs font-bold text-[#168044] hover:bg-[#edfbf1]"
              href="/login"
              onClick={handleAppLink("/login")}
            >
              Sign In
            </a>
          )}
        </div>
      </nav>
    </header>
  );
}

/* -------------------------------------------------------------------------- */
/* Marketplace View                                                           */
/* -------------------------------------------------------------------------- */
function MarketplaceView({
  query,
  setQuery,
  category,
  setCategory,
  listingType,
  setListingType,
  condition,
  setCondition,
  minPrice,
  setMinPrice,
  maxPrice,
  setMaxPrice,
  sort,
  setSort,
  categoriesList,
  filteredProducts,
  loading,
  error,
  liked,
  toggleLiked,
  resetFilters,
  onSelectProduct,
  onAdd,
}) {
  return (
    <>
      {/* Hero Banner */}
      <section className="mx-auto max-w-7xl px-4 pt-5 sm:px-8">
        <div className="rounded-2xl bg-gradient-to-r from-[#08a649] via-[#05964f] to-[#04b978] px-6 py-8 text-white shadow-[0_18px_45px_rgba(8,166,73,.16)] sm:px-10">
          <span className="rounded-full bg-white/15 px-3 py-1.5 text-[10px] font-bold tracking-[.12em]">
            CAMPUS MARKETPLACE
          </span>
          <h1 className="mt-4 max-w-2xl text-3xl font-black leading-tight sm:text-4xl">
            Buy, sell, rent &amp; exchange with fellow students.
          </h1>
          <p className="mt-3 text-sm text-white/90">
            ♻ Give your unused textbooks, electronics &amp; hostel essentials a new life — sustainably.
          </p>
          <div className="mt-6 flex max-w-2xl rounded-xl bg-white p-1.5 shadow-lg">
            <Search className="m-2.5 shrink-0 text-[#9aa9a0]" size={18} />
            <input
              aria-label="Search marketplace"
              className="min-w-0 flex-1 bg-transparent px-1 text-xs text-[#173126] outline-none placeholder:text-[#95a39c]"
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search books, calculators, laptops, lab gear..."
              value={query}
            />
            <button
              className="rounded-lg bg-[#079344] px-4 py-2.5 text-xs font-bold text-white transition hover:bg-[#06803b]"
              type="button"
            >
              Search
            </button>
          </div>
        </div>
      </section>

      {/* Horizontal Category Pill Bar */}
      <section className="mx-auto max-w-7xl overflow-x-auto px-4 py-4 sm:px-8">
        <div className="flex min-w-max gap-2">
          <button
            className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2.5 text-[11px] font-bold transition ${
              category === "All"
                ? "bg-[#08a649] text-white shadow-sm"
                : "bg-white text-[#62736a] shadow-sm hover:bg-[#edfbf1]"
            }`}
            onClick={() => setCategory("All")}
            type="button"
          >
            <Tag size={14} />
            All Categories
          </button>
          {categoriesList.map((cat) => {
            const Icon = categoryIconMap[cat.name] || Tag;
            return (
              <button
                className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2.5 text-[11px] font-bold transition ${
                  category === cat.name
                    ? "bg-[#08a649] text-white shadow-sm"
                    : "bg-white text-[#62736a] shadow-sm hover:bg-[#edfbf1]"
                }`}
                key={cat.id || cat.name}
                onClick={() => setCategory(cat.name)}
                type="button"
              >
                <Icon size={14} />
                {cat.name}
              </button>
            );
          })}
        </div>
      </section>

      {/* Main Content Layout with Sidebar */}
      <section className="mx-auto grid max-w-7xl gap-5 px-4 pb-12 sm:px-8 lg:grid-cols-[200px_1fr]">
        <FilterSidebar
          category={category}
          setCategory={setCategory}
          listingType={listingType}
          setListingType={setListingType}
          condition={condition}
          setCondition={setCondition}
          minPrice={minPrice}
          setMinPrice={setMinPrice}
          maxPrice={maxPrice}
          setMaxPrice={setMaxPrice}
          categoriesList={categoriesList}
          resetFilters={resetFilters}
        />

        <div>
          {/* Controls Bar */}
          <div className="mb-4 flex items-center justify-between">
            <p className="text-xs text-[#7b897f]">
              <strong className="text-[#173126]">
                {filteredProducts.length} products found
              </strong>
            </p>
            <label className="flex items-center gap-2 text-[11px] text-[#758279]">
              Sort:
              <select
                aria-label="Sort products"
                className="rounded-lg border border-[#dce6dd] bg-white px-2.5 py-2 font-bold text-[#33443a] outline-none focus:border-[#08a649]"
                onChange={(e) => setSort(e.target.value)}
                value={sort}
              >
                <option>Newest</option>
                <option>Price: Low to High</option>
                <option>Price: High to Low</option>
                <option>Top Rated</option>
              </select>
            </label>
          </div>

          {/* Loading and Error states */}
          {loading && (
            <div className="grid place-items-center rounded-2xl border border-[#dfe8e1] bg-white p-16 text-center">
              <LoaderCircle className="animate-spin text-[#08a649]" size={32} />
              <p className="mt-3 text-xs font-semibold text-[#66766d]">
                Loading campus listings…
              </p>
            </div>
          )}

          {!loading && error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center text-xs text-red-600">
              {error}
            </div>
          )}

          {!loading && !error && filteredProducts.length === 0 && (
            <div className="rounded-2xl border border-dashed border-[#cbdacf] bg-white p-12 text-center text-sm text-[#758279]">
              <Package className="mx-auto text-[#8ea597]" size={36} />
              <p className="mt-3 font-bold text-[#173126]">No products match these filters.</p>
              <p className="mt-1 text-xs text-[#809087]">
                Try expanding your search terms or clearing price and condition limits.
              </p>
              <div className="mt-5 flex justify-center gap-2">
                <button
                  className="rounded-xl border border-[#cce3d2] bg-[#f7fcf8] px-4 py-2 text-xs font-bold text-[#168044] hover:bg-[#edfbf1]"
                  onClick={resetFilters}
                  type="button"
                >
                  Reset Filters
                </button>
                <button
                  className="rounded-xl bg-[#08a649] px-4 py-2 text-xs font-bold text-white hover:bg-[#078b3e]"
                  onClick={onAdd}
                  type="button"
                >
                  List this item first
                </button>
              </div>
            </div>
          )}

          {/* Products Grid */}
          {!loading && !error && filteredProducts.length > 0 && (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredProducts.map((prod) => (
                <ProductCard
                  key={prod.id}
                  product={prod}
                  liked={liked.includes(prod.id)}
                  onLike={() => toggleLiked(prod.id)}
                  onView={() => onSelectProduct(prod)}
                />
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Filter Sidebar                                                             */
/* -------------------------------------------------------------------------- */
function FilterSidebar({
  category,
  setCategory,
  listingType,
  setListingType,
  condition,
  setCondition,
  minPrice,
  setMinPrice,
  maxPrice,
  setMaxPrice,
  categoriesList,
  resetFilters,
}) {
  return (
    <aside className="rounded-2xl border border-[#dce7df] bg-white p-4 shadow-sm">
      <h2 className="text-xs font-bold text-[#173126]">Category</h2>
      <button
        className={`mt-3 flex w-full justify-between rounded-lg px-3 py-2 text-[11px] font-bold transition ${
          category === "All"
            ? "bg-[#edfbf1] text-[#078b3e]"
            : "text-[#516158] hover:bg-[#f6faf7]"
        }`}
        onClick={() => setCategory("All")}
        type="button"
      >
        All Categories
      </button>

      {categoriesList.map((c) => (
        <button
          className={`mt-1 flex w-full justify-between rounded-lg px-3 py-2 text-[11px] transition ${
            category === c.name
              ? "bg-[#edfbf1] font-bold text-[#078b3e]"
              : "text-[#516158] hover:bg-[#f6faf7]"
          }`}
          key={c.id || c.name}
          onClick={() => setCategory(c.name)}
          type="button"
        >
          <span>{c.name}</span>
          <span className="text-[10px] text-[#a0aaa3]">{c.count}</span>
        </button>
      ))}

      <FilterChoices
        label="Listing Type"
        options={["All Types", "For Sale", "For Rent", "Exchange"]}
        value={listingType}
        onChange={setListingType}
      />

      <FilterChoices
        label="Condition"
        options={["All", "New", "Like New", "Good", "Fair"]}
        value={condition}
        onChange={setCondition}
      />

      <div className="mt-5 border-t border-[#edf1ed] pt-4">
        <h3 className="text-[11px] font-bold text-[#173126]">Price Range</h3>
        <div className="mt-3 flex gap-2">
          <input
            aria-label="Minimum price"
            className="w-1/2 rounded-lg border border-[#dce6dd] px-2.5 py-2 text-[11px] outline-none focus:border-[#08a649]"
            onChange={(e) => setMinPrice(e.target.value)}
            placeholder="Min"
            type="number"
            value={minPrice}
          />
          <input
            aria-label="Maximum price"
            className="w-1/2 rounded-lg border border-[#dce6dd] px-2.5 py-2 text-[11px] outline-none focus:border-[#08a649]"
            onChange={(e) => setMaxPrice(e.target.value)}
            placeholder="Max"
            type="number"
            value={maxPrice}
          />
        </div>
      </div>

      <button
        className="mt-5 w-full rounded-lg border border-[#cbe1cf] py-2.5 text-[11px] font-bold text-[#168044] transition hover:bg-[#edfbf1]"
        onClick={resetFilters}
        type="button"
      >
        Reset Filters
      </button>
    </aside>
  );
}

function FilterChoices({ label, options, value, onChange }) {
  return (
    <div className="mt-5 border-t border-[#edf1ed] pt-4">
      <h3 className="text-[11px] font-bold text-[#173126]">{label}</h3>
      {options.map((option) => (
        <label
          className={`mt-1.5 flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] transition ${
            value === option
              ? "bg-[#edfbf1] font-bold text-[#078b3e]"
              : "text-[#516158] hover:bg-[#f6faf7]"
          }`}
          key={option}
        >
          <input
            checked={value === option}
            className="accent-[#08a649]"
            name={label}
            onChange={() => onChange(option)}
            type="radio"
          />
          {option}
        </label>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Product Card                                                               */
/* -------------------------------------------------------------------------- */
function ProductCard({ product, liked, onLike, onView }) {
  const primaryImg =
    product.images?.[0]?.image_url || product.image_url || campusMarketplace;

  const displayPrice =
    product.product_type === "Exchange"
      ? "Exchange"
      : product.product_type === "For Rent" || product.product_type === "Rent"
      ? `Rs. ${product.rental_price_per_day || product.price} / day`
      : `Rs. ${product.price?.toLocaleString?.() ?? product.price}`;

  const sellerInitials = product.seller_student_id
    ? product.seller_student_id.slice(-2)
    : product.seller_name
    ? product.seller_name.slice(0, 2).toUpperCase()
    : "ST";

  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-[#dfe8e1] bg-white shadow-[0_8px_24px_rgba(26,61,39,.04)] transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="relative h-40 overflow-hidden bg-[#dceee3]">
        <img
          alt={product.title}
          className="size-full object-cover transition duration-300 hover:scale-105"
          src={primaryImg}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/15 to-transparent" />

        <span
          className={`absolute left-3 top-3 rounded-full border px-2.5 py-1 text-[10px] font-bold ${
            typeStyles[product.product_type] || "bg-emerald-50 text-emerald-800"
          }`}
        >
          {product.product_type === "Exchange"
            ? "🤝 Exchange"
            : product.product_type === "For Rent" || product.product_type === "Rent"
            ? "🔄 For Rent"
            : "🏷️ For Sale"}
        </span>

        {product.location && (
          <span className="absolute bottom-3 left-3 flex items-center gap-1 text-[10px] font-medium text-white/95">
            <MapPin size={11} /> {product.location}
          </span>
        )}

        <button
          aria-label={`${liked ? "Remove" : "Add"} ${product.title} wishlist`}
          className={`absolute right-3 top-3 grid size-8 place-items-center rounded-full bg-white/90 shadow-sm transition hover:scale-110 ${
            liked ? "text-red-500" : "text-[#829087]"
          }`}
          onClick={onLike}
          type="button"
        >
          <Heart fill={liked ? "currentColor" : "none"} size={15} />
        </button>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-semibold text-[#39705a]">
            {product.category}
          </span>
          <span className="rounded-full bg-[#edf8ef] px-2 py-0.5 text-[10px] font-bold text-[#25724a]">
            {product.condition}
          </span>
        </div>

        <h3 className="mt-2 min-h-10 text-sm font-bold leading-5 text-[#173126]">
          {product.title}
        </h3>

        <div className="mt-1 flex items-center gap-1 text-[11px] text-[#758279]">
          <Star className="fill-[#f5b83d] text-[#f5b83d]" size={13} />
          <strong>{product.rating > 0 ? product.rating : "New"}</strong>
          <span>({product.reviews_count || 0})</span>
        </div>

        <div className="mt-2 text-base font-black text-[#168044]">
          {displayPrice}
        </div>

        <div className="mt-auto border-t border-[#edf1ed] pt-3">
          <div className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-full bg-[#e1f1e5] text-[10px] font-bold text-[#16723d]">
              {sellerInitials}
            </span>
            <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-[#304137]">
              {product.seller_name}
            </span>
            <span
              className="rounded-full border border-[#b9e9c4] bg-[#edfbf1] px-1.5 py-0.5 text-[10px] font-bold text-[#168044]"
              title="Verified Seller Score"
            >
              {product.seller_score}%
            </span>
          </div>

          <button
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[#08a649] py-2.5 text-[11px] font-bold text-white shadow-sm transition hover:bg-[#078b3e]"
            onClick={onView}
            type="button"
          >
            View Details <ArrowRight size={13} />
          </button>
        </div>
      </div>
    </article>
  );
}

/* -------------------------------------------------------------------------- */
/* Categories View                                                            */
/* -------------------------------------------------------------------------- */
function CategoriesView({ setView, setCategory, categoriesList, productsCount }) {
  return (
    <PageShell
      eyebrow="Explore the marketplace"
      title="Everything you need for campus life."
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          [productsCount || 8, "Total Listings", ShoppingBag],
          [categoriesList.length || 8, "Categories", Tag],
          ["Verified", "Student Sellers", ShieldCheck],
          ["Active", "Campus Hub", GraduationCap],
        ].map(([value, label, Icon]) => (
          <MetricCard icon={Icon} key={label} label={label} value={value} />
        ))}
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {categoriesList.map((cat) => {
          const Icon = categoryIconMap[cat.name] || Tag;
          return (
            <article
              className="group rounded-2xl border border-[#dfe8e1] bg-white p-5 transition hover:-translate-y-1 hover:shadow-lg"
              key={cat.id || cat.name}
            >
              <span className="grid size-11 place-items-center rounded-xl bg-[#e9f8ed] text-[#168044]">
                <Icon size={20} />
              </span>
              <h3 className="mt-5 font-bold text-[#173126]">{cat.name}</h3>
              <p className="mt-1 text-xs text-[#809087]">
                {cat.count} items available
              </p>
              <button
                className="mt-5 inline-flex items-center gap-1 text-xs font-bold text-[#168044] transition group-hover:gap-2"
                onClick={() => {
                  setCategory(cat.name);
                  setView("Marketplace");
                }}
                type="button"
              >
                Browse category <ArrowRight size={14} />
              </button>
            </article>
          );
        })}
      </div>

      <div className="mt-8 flex flex-col justify-between gap-4 rounded-2xl bg-[#0b8f45] p-7 text-white sm:flex-row sm:items-center">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.13em] text-emerald-100">
            Small actions, real impact
          </p>
          <h2 className="mt-2 text-2xl font-black">Trade sustainably with your campus.</h2>
        </div>
        <button
          className="inline-flex items-center gap-2 self-start rounded-xl bg-white px-5 py-3 text-xs font-bold text-[#08743a] transition hover:bg-emerald-50"
          onClick={() => setView("Marketplace")}
          type="button"
        >
          Start browsing <ArrowRight size={15} />
        </button>
      </div>
    </PageShell>
  );
}

/* -------------------------------------------------------------------------- */
/* My Products View (Seller Workspace)                                        */
/* -------------------------------------------------------------------------- */
function ProductsView({
  products,
  layout,
  setLayout,
  onAdd,
  onEdit,
  onDelete,
  onSelectProduct,
  user,
}) {
  const activeCount = products.filter(
    (item) => item.status === "available" || item.status === "Active"
  ).length;
  const rentedCount = products.filter(
    (item) => item.status === "rented" || item.status === "Rented"
  ).length;

  return (
    <PageShell eyebrow="Seller workspace" title="Manage your products.">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          [products.length, "Total Products", ShoppingBag],
          [activeCount, "Active Listings", TrendingUp],
          [rentedCount, "Rented Out", CircleDollarSign],
          [user?.student_id || "Verified", "Seller Identity", ShieldCheck],
        ].map(([value, label, Icon]) => (
          <MetricCard icon={Icon} key={label} label={label} value={value} />
        ))}
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-[#173126]">Your listings</h2>
          <p className="mt-1 text-xs text-[#7d8c83]">
            Keep your campus inventory up to date.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-[#dce7df] bg-white p-1">
            <button
              aria-label="Grid view"
              className={`rounded-md p-2 transition ${
                layout === "grid"
                  ? "bg-[#e8f7eb] text-[#168044]"
                  : "text-[#819087] hover:bg-[#f2f6f2]"
              }`}
              onClick={() => setLayout("grid")}
              type="button"
            >
              <LayoutGrid size={15} />
            </button>
            <button
              aria-label="List view"
              className={`rounded-md p-2 transition ${
                layout === "list"
                  ? "bg-[#e8f7eb] text-[#168044]"
                  : "text-[#819087] hover:bg-[#f2f6f2]"
              }`}
              onClick={() => setLayout("list")}
              type="button"
            >
              <List size={15} />
            </button>
          </div>

          <button
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#08a649] px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-[#078b3e]"
            onClick={onAdd}
            type="button"
          >
            <Plus size={15} /> Add Product
          </button>
        </div>
      </div>

      {products.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-[#cbdacf] bg-white p-12 text-center text-sm text-[#758279]">
          <Package className="mx-auto text-[#8fa799]" size={36} />
          <h3 className="mt-3 text-base font-bold text-[#173126]">
            No products listed yet
          </h3>
          <p className="mt-1 text-xs text-[#809087]">
            You have not added any marketplace listings. List textbooks, electronics, or lab gear now.
          </p>
          <button
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#08a649] px-5 py-2.5 text-xs font-bold text-white hover:bg-[#078b3e]"
            onClick={onAdd}
            type="button"
          >
            <Plus size={15} /> List your first item
          </button>
        </div>
      ) : layout === "list" ? (
        <div className="mt-4 overflow-x-auto rounded-2xl border border-[#dfe8e1] bg-white shadow-sm">
          <table className="w-full min-w-[700px] text-left text-xs">
            <thead className="border-b border-[#edf1ed] bg-[#f9fbf9] text-[10px] uppercase tracking-wider text-[#8c9991]">
              <tr>
                <th className="p-4">Product</th>
                <th>Category</th>
                <th>Type</th>
                <th>Price</th>
                <th>Rating</th>
                <th>Status</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.map((prod) => {
                const img =
                  prod.images?.[0]?.image_url || prod.image_url || campusMarketplace;
                return (
                  <tr
                    className="border-b border-[#f0f3f0] transition hover:bg-[#fafdface] last:border-0"
                    key={prod.id}
                  >
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <img
                          alt=""
                          className="size-11 rounded-xl object-cover"
                          src={img}
                        />
                        <div>
                          <strong
                            className="cursor-pointer text-[#173126] hover:text-[#08a649]"
                            onClick={() => onSelectProduct(prod)}
                          >
                            {prod.title}
                          </strong>
                          <p className="mt-0.5 text-[10px] text-[#93a097]">
                            {new Date(prod.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td>{prod.category}</td>
                    <td>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                          typeStyles[prod.product_type] || "bg-emerald-50 text-emerald-800"
                        }`}
                      >
                        {prod.product_type}
                      </span>
                    </td>
                    <td className="font-bold text-[#173126]">
                      {prod.product_type === "Exchange"
                        ? "Exchange"
                        : `Rs. ${prod.price?.toLocaleString?.() ?? prod.price}`}
                    </td>
                    <td>
                      <Star
                        className="mr-1 inline fill-[#f5b83d] text-[#f5b83d]"
                        size={12}
                      />
                      {prod.rating > 0 ? prod.rating : "New"}
                    </td>
                    <td>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          prod.status === "available" || prod.status === "Active"
                            ? "bg-[#e9f8ed] text-[#168044]"
                            : "bg-[#f2f3f2] text-[#7d8981]"
                        }`}
                      >
                        {prod.status}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex justify-end gap-1">
                        <button
                          aria-label={`Edit ${prod.title}`}
                          className="rounded-lg p-2 text-[#688077] transition hover:bg-[#eef8f0] hover:text-[#08a649]"
                          onClick={() => onEdit(prod)}
                          type="button"
                        >
                          <Edit3 size={15} />
                        </button>
                        <button
                          aria-label={`Delete ${prod.title}`}
                          className="rounded-lg p-2 text-[#b05a5a] transition hover:bg-red-50 hover:text-red-700"
                          onClick={() => onDelete(prod)}
                          type="button"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((prod) => (
            <div className="relative" key={prod.id}>
              <ProductCard
                liked={false}
                onLike={() => {}}
                onView={() => onSelectProduct(prod)}
                product={prod}
              />
              <div className="absolute right-3 top-3 z-10 flex gap-1">
                <button
                  aria-label={`Edit ${prod.title}`}
                  className="grid size-8 place-items-center rounded-full bg-white/95 text-[#324f43] shadow-md transition hover:bg-[#edfbf1] hover:text-[#08a649]"
                  onClick={() => onEdit(prod)}
                  type="button"
                >
                  <Edit3 size={14} />
                </button>
                <button
                  aria-label={`Delete ${prod.title}`}
                  className="grid size-8 place-items-center rounded-full bg-white/95 text-[#b05a5a] shadow-md transition hover:bg-red-50 hover:text-red-600"
                  onClick={() => onDelete(prod)}
                  type="button"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </PageShell>
  );
}

/* -------------------------------------------------------------------------- */
/* My Reviews View                                                            */
/* -------------------------------------------------------------------------- */
function ReviewsView({ reviews, user, onRefresh, showToast }) {
  const [editingReview, setEditingReview] = useState(null);
  const [editRating, setEditRating] = useState(5);
  const [editComment, setEditComment] = useState("");
  const [saving, setSaving] = useState(false);

  const avgGiven = useMemo(() => {
    if (!reviews.length) return "5.0";
    const sum = reviews.reduce((acc, r) => acc + r.rating, 0);
    return (sum / reviews.length).toFixed(1);
  }, [reviews]);

  async function handleUpdateReview() {
    if (!editingReview) return;
    setSaving(true);
    try {
      await apiUpdateReview(editingReview.id, {
        rating: editRating,
        comment: editComment,
      });
      showToast("Review updated successfully.");
      setEditingReview(null);
      onRefresh();
    } catch (err) {
      showToast(err.response?.data?.detail || "Failed to update review.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteReview(reviewId) {
    if (!confirm("Are you sure you want to delete this review?")) return;
    try {
      await apiDeleteReview(reviewId);
      showToast("Review deleted.");
      onRefresh();
    } catch (err) {
      showToast(err.response?.data?.detail || "Failed to delete review.", "error");
    }
  }

  return (
    <PageShell eyebrow="Your feedback" title="Reviews you have shared.">
      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard icon={Star} label="Total Reviews" value={reviews.length} />
        <MetricCard icon={TrendingUp} label="Avg. Rating Given" value={avgGiven} />
        <MetricCard icon={ShieldCheck} label="Verified Reviews" value="100%" />
      </div>

      <div className="mt-8 space-y-4">
        {reviews.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#cbdacf] bg-white p-12 text-center text-sm text-[#758279]">
            <Star className="mx-auto text-[#f5b83d]" size={36} />
            <h3 className="mt-3 text-base font-bold text-[#173126]">
              No reviews submitted yet
            </h3>
            <p className="mt-1 text-xs text-[#809087]">
              When you purchase or rent products on UniSwap, share your honest feedback here to help fellow students.
            </p>
          </div>
        ) : (
          reviews.map((rev) => (
            <article
              className="rounded-2xl border border-[#dfe8e1] bg-white p-5 shadow-sm"
              key={rev.id}
            >
              <div className="flex flex-col gap-4 sm:flex-row">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="font-bold text-[#173126]">
                        {rev.product_title}
                      </h3>
                      <p className="mt-1 text-[11px] text-[#8b9990]">
                        Reviewed on {new Date(rev.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#e9f8ed] px-2.5 py-1 text-[10px] font-bold text-[#168044]">
                      <Check size={12} /> Verified student review
                    </span>
                  </div>

                  <div className="mt-3 flex gap-0.5 text-[#f5b83d]">
                    {Array.from({ length: 5 }, (_, idx) => (
                      <Star
                        className={
                          idx < rev.rating ? "fill-current" : "text-[#dbe3dd]"
                        }
                        key={idx}
                        size={15}
                      />
                    ))}
                  </div>

                  <p className="mt-3 text-sm leading-6 text-[#607169]">
                    {rev.comment}
                  </p>

                  <div className="mt-4 flex items-center justify-end gap-3 border-t border-[#edf1ed] pt-3 text-xs">
                    <button
                      className="font-bold text-[#168044] hover:underline"
                      onClick={() => {
                        setEditingReview(rev);
                        setEditRating(rev.rating);
                        setEditComment(rev.comment);
                      }}
                      type="button"
                    >
                      Edit Review
                    </button>
                    <button
                      className="font-bold text-[#ae5c5c] hover:underline"
                      onClick={() => handleDeleteReview(rev.id)}
                      type="button"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            </article>
          ))
        )}
      </div>

      {/* Edit Review Modal */}
      {editingReview && (
        <Modal
          onClose={() => setEditingReview(null)}
          title={`Edit review for ${editingReview.product_title}`}
        >
          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold text-[#173126]">Rating</label>
              <div className="mt-2 flex gap-1 text-[#f5b83d]">
                {Array.from({ length: 5 }, (_, i) => (
                  <button
                    className="p-1"
                    key={i}
                    onClick={() => setEditRating(i + 1)}
                    type="button"
                  >
                    <Star
                      className={
                        i < editRating ? "fill-current" : "text-[#dbe3dd]"
                      }
                      size={24}
                    />
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-bold text-[#173126]">Comment</label>
              <textarea
                className="mt-2 w-full rounded-xl border border-[#dce7df] p-3 text-xs outline-none focus:border-[#08a649]"
                onChange={(e) => setEditComment(e.target.value)}
                rows={4}
                value={editComment}
              />
            </div>
          </div>
          <div className="mt-6 flex justify-end gap-2 border-t border-[#edf1ed] pt-4">
            <button
              className="rounded-xl px-4 py-2 text-xs font-bold text-[#708077]"
              onClick={() => setEditingReview(null)}
              type="button"
            >
              Cancel
            </button>
            <button
              className="rounded-xl bg-[#08a649] px-5 py-2 text-xs font-bold text-white hover:bg-[#078b3e] disabled:opacity-50"
              disabled={saving || !editComment.trim()}
              onClick={handleUpdateReview}
              type="button"
            >
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </Modal>
      )}
    </PageShell>
  );
}

/* -------------------------------------------------------------------------- */
/* Product Details Modal with Reviews and Seller Reputation                   */
/* -------------------------------------------------------------------------- */
function ProductDetailsModal({
  product,
  user,
  onClose,
  onProductUpdated,
  showToast,
}) {
  const [reviews, setReviews] = useState([]);
  const [avgRating, setAvgRating] = useState(product.rating || 0);
  const [loadingReviews, setLoadingReviews] = useState(true);
  const [newRating, setNewRating] = useState(5);
  const [newComment, setNewComment] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewError, setReviewError] = useState(null);
  const [sellerReputation, setSellerReputation] = useState(null);
  const [selectedImage, setSelectedImage] = useState(
    product.images?.[0]?.image_url || product.image_url || campusMarketplace
  );

  const isOwner = user?.id === product.seller_id;
  const userHasReviewed = reviews.some((r) => r.user_id === user?.id);

  const fetchReviews = useCallback(async () => {
    setLoadingReviews(true);
    try {
      const res = await getProductReviews(product.id);
      setReviews(res.items || []);
      setAvgRating(res.average_rating || 0);
    } catch {
      // ignore
    } finally {
      setLoadingReviews(false);
    }
  }, [product.id]);

  useEffect(() => {
    fetchReviews();
    getSellerReputation(product.seller_id)
      .then(setSellerReputation)
      .catch(() => {});
  }, [fetchReviews, product.seller_id]);

  async function handleAddReview(e) {
    e.preventDefault();
    if (!user?.id) {
      navigate("/login?returnTo=/marketplace");
      return;
    }
    setReviewError(null);
    setSubmittingReview(true);
    try {
      await createReview(product.id, {
        rating: newRating,
        comment: newComment,
      });
      showToast("Review submitted successfully!");
      setNewComment("");
      fetchReviews();
      onProductUpdated?.();
    } catch (err) {
      setReviewError(
        err.response?.data?.detail || "Failed to submit review. Try again."
      );
    } finally {
      setSubmittingReview(false);
    }
  }

  const allImages =
    product.images && product.images.length > 0
      ? product.images.map((i) => i.image_url)
      : [product.image_url || campusMarketplace];

  const sellerInitials = product.seller_student_id
    ? product.seller_student_id.slice(-2)
    : product.seller_name
    ? product.seller_name.slice(0, 2).toUpperCase()
    : "ST";

  return (
    <Modal onClose={onClose} title={product.title}>
      <div className="space-y-6">
        {/* Main Image Gallery */}
        <div className="overflow-hidden rounded-2xl bg-[#ebf3ee]">
          <div className="h-64 sm:h-80 overflow-hidden bg-black/5">
            <img
              alt={product.title}
              className="size-full object-contain"
              src={selectedImage}
            />
          </div>

          {allImages.length > 1 && (
            <div className="flex gap-2 overflow-x-auto p-3">
              {allImages.map((img, i) => (
                <button
                  className={`size-16 shrink-0 overflow-hidden rounded-xl border-2 transition ${
                    selectedImage === img
                      ? "border-[#08a649] ring-2 ring-[#08a649]/30"
                      : "border-transparent opacity-70 hover:opacity-100"
                  }`}
                  key={i}
                  onClick={() => setSelectedImage(img)}
                  type="button"
                >
                  <img alt="" className="size-full object-cover" src={img} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Product Details Header */}
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span
                className={`rounded-full border px-3 py-1 text-xs font-bold ${
                  typeStyles[product.product_type] || "bg-emerald-50 text-emerald-800"
                }`}
              >
                {product.product_type}
              </span>
              <span className="rounded-full bg-[#edf8ef] px-3 py-1 text-xs font-bold text-[#25724a]">
                {product.condition}
              </span>
              <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold text-neutral-600">
                {product.category}
              </span>
            </div>

            <div className="text-xl font-black text-[#168044]">
              {product.product_type === "Exchange"
                ? "Exchange Item"
                : product.product_type === "For Rent" || product.product_type === "Rent"
                ? `Rs. ${product.rental_price_per_day || product.price} / day`
                : `Rs. ${product.price?.toLocaleString?.() ?? product.price}`}
            </div>
          </div>

          {product.rental_duration && (
            <p className="mt-1 text-xs font-semibold text-[#66766d]">
              Rental terms: {product.rental_duration}
            </p>
          )}

          {product.location && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-[#52645a]">
              <MapPin className="text-[#08a649]" size={14} />
              Campus Location: <strong>{product.location}</strong>
            </p>
          )}

          {product.description && (
            <div className="mt-4 rounded-xl bg-[#f7faf8] p-4 text-xs leading-6 text-[#4a5c53]">
              {product.description}
            </div>
          )}
        </div>

        {/* Seller Reputation Card */}
        <div className="rounded-2xl border border-[#dfe8e1] bg-[#f9fbf9] p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#358359]">
            Seller Identity &amp; Reputation
          </p>
          <div className="mt-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-2xl bg-[#d9f2e2] text-sm font-bold text-[#147a3a]">
                {sellerInitials}
              </span>
              <div>
                <strong className="text-sm text-[#173126]">
                  {product.seller_name}
                </strong>
                <p className="text-[11px] text-[#718077]">
                  {sellerReputation?.total_products || 1} active listings
                </p>
              </div>
            </div>

            <div className="text-right">
              <div className="inline-flex items-center gap-1 rounded-full border border-[#b9e9c4] bg-[#edfbf1] px-2.5 py-1 text-xs font-bold text-[#168044]">
                <ShieldCheck size={14} />
                {sellerReputation?.score ?? product.seller_score}% Trust Score
              </div>
              <p className="mt-1 flex items-center justify-end gap-1 text-[11px] text-[#788880]">
                <Star className="fill-[#f5b83d] text-[#f5b83d]" size={12} />
                {sellerReputation?.average_rating ?? "5.0"} (
                {sellerReputation?.total_reviews ?? 0} reviews)
              </p>
            </div>
          </div>
        </div>

        {/* Reviews Section */}
        <div className="border-t border-[#edf1ed] pt-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-[#173126]">
                Reviews &amp; Ratings
              </h3>
              <p className="text-xs text-[#7d8c83]">
                Feedback from campus peers who bought or rented this item.
              </p>
            </div>
            <div className="flex items-center gap-1.5 rounded-xl bg-[#fdf8ee] px-3 py-1.5 text-sm font-bold text-[#a67c1e]">
              <Star className="fill-current text-[#f5b83d]" size={16} />
              <span>{avgRating > 0 ? avgRating : "New"}</span>
              <span className="text-xs font-normal text-[#8d9c92]">
                ({reviews.length})
              </span>
            </div>
          </div>

          {/* Add Review Form */}
          {isOwner ? (
            <div className="mt-4 rounded-xl border border-dashed border-[#cbdacf] bg-[#fafcfa] p-4 text-center text-xs text-[#718278]">
              You are the seller of this listing and cannot submit a review for your own product.
            </div>
          ) : userHasReviewed ? (
            <div className="mt-4 rounded-xl bg-[#eef8f1] p-4 text-center text-xs font-semibold text-[#187540]">
              <Check className="mr-1 inline" size={14} /> You have already submitted a review for this listing.
            </div>
          ) : (
            <form
              className="mt-4 rounded-2xl border border-[#dfe8e1] bg-white p-4 shadow-sm"
              onSubmit={handleAddReview}
            >
              <h4 className="text-xs font-bold text-[#173126]">
                Write a verified review
              </h4>

              {reviewError && (
                <div className="mt-2 rounded-lg bg-red-50 p-2.5 text-xs text-red-600">
                  {reviewError}
                </div>
              )}

              <div className="mt-3 flex items-center gap-1 text-[#f5b83d]">
                <span className="mr-2 text-xs font-bold text-[#63756b]">Your Rating:</span>
                {Array.from({ length: 5 }, (_, idx) => (
                  <button
                    className="p-1 transition hover:scale-110"
                    key={idx}
                    onClick={() => setNewRating(idx + 1)}
                    type="button"
                  >
                    <Star
                      className={
                        idx < newRating ? "fill-current" : "text-[#dbe3dd]"
                      }
                      size={20}
                    />
                  </button>
                ))}
              </div>

              <textarea
                className="mt-3 w-full rounded-xl border border-[#dce7df] p-3 text-xs outline-none focus:border-[#08a649]"
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Share your experience: condition, handover smoothness, communication..."
                required
                rows={3}
                value={newComment}
              />

              <div className="mt-3 flex justify-end">
                <button
                  className="rounded-xl bg-[#08a649] px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-[#078b3e] disabled:opacity-50"
                  disabled={submittingReview || !newComment.trim()}
                  type="submit"
                >
                  {submittingReview ? "Submitting…" : "Post Review"}
                </button>
              </div>
            </form>
          )}

          {/* Reviews List */}
          <div className="mt-5 space-y-3">
            {loadingReviews ? (
              <p className="py-4 text-center text-xs text-[#809087]">
                Loading reviews…
              </p>
            ) : reviews.length === 0 ? (
              <p className="py-4 text-center text-xs text-[#809087]">
                No reviews yet for this product. Be the first to share your experience!
              </p>
            ) : (
              reviews.map((rev) => (
                <div
                  className="rounded-xl border border-[#edf1ed] bg-white p-3.5"
                  key={rev.id}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="grid size-6 place-items-center rounded-full bg-[#e1f1e5] text-[9px] font-bold text-[#16723d]">
                        {rev.user_student_id
                          ? rev.user_student_id.slice(-2)
                          : rev.user_name.slice(0, 2).toUpperCase()}
                      </span>
                      <strong className="text-xs text-[#173126]">
                        {rev.user_name}
                      </strong>
                    </div>
                    <span className="text-[10px] text-[#93a199]">
                      {new Date(rev.created_at).toLocaleDateString()}
                    </span>
                  </div>

                  <div className="mt-2 flex gap-0.5 text-[#f5b83d]">
                    {Array.from({ length: 5 }, (_, i) => (
                      <Star
                        className={
                          i < rev.rating ? "fill-current" : "text-[#dbe3dd]"
                        }
                        key={i}
                        size={12}
                      />
                    ))}
                  </div>

                  <p className="mt-2 text-xs leading-5 text-[#55675e]">
                    {rev.comment}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/* Add / Edit Product Modal                                                   */
/* -------------------------------------------------------------------------- */
function ProductModal({
  initialProduct,
  categoriesList,
  onClose,
  onSaved,
  showToast,
}) {
  const [title, setTitle] = useState(initialProduct?.title || "");
  const [description, setDescription] = useState(
    initialProduct?.description || ""
  );
  const [category, setCategory] = useState(
    initialProduct?.category || "Academic Books"
  );
  const [condition, setCondition] = useState(
    initialProduct?.condition || "Like New"
  );
  const [productType, setProductType] = useState(
    initialProduct?.product_type || "For Sale"
  );
  const [price, setPrice] = useState(
    initialProduct?.price !== undefined ? String(initialProduct.price) : ""
  );
  const [rentalPricePerDay, setRentalPricePerDay] = useState(
    initialProduct?.rental_price_per_day !== undefined &&
      initialProduct?.rental_price_per_day !== null
      ? String(initialProduct.rental_price_per_day)
      : ""
  );
  const [rentalDuration, setRentalDuration] = useState(
    initialProduct?.rental_duration || "Per week"
  );
  const [location, setLocation] = useState(initialProduct?.location || "");
  const [status, setStatus] = useState(initialProduct?.status || "available");

  // Multi-image management
  const [images, setImages] = useState(
    initialProduct?.images?.map((img) => img.image_url) || []
  );
  const [uploadingImage, setUploadingImage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  async function handleImageFile(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    setUploadingImage(true);
    setFormError(null);

    try {
      const { processImage } = await import("../utils/imageProcessor");

      for (const file of files) {
        try {
          // Process: resize, compress, convert format
          const { file: processedFile, previewUrl } = await processImage(file);

          // Upload processed file to server
          const url = await uploadProductImage(processedFile);
          setImages((prev) => [...prev, url]);

          // Clean up the local preview blob
          URL.revokeObjectURL(previewUrl);
        } catch (err) {
          const msg =
            err.response?.data?.detail ||
            err.message ||
            "Could not process this image.";
          showToast(`${file.name}: ${msg}`, "error");
        }
      }
    } catch (err) {
      setFormError("Failed to load image processor. Please refresh and try again.");
    } finally {
      setUploadingImage(false);
      // Reset file input so the same file can be re-selected
      e.target.value = "";
    }
  }

  function removeImage(index) {
    setImages((prev) => prev.filter((_, idx) => idx !== index));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim()) {
      setFormError("Product title is required.");
      return;
    }

    const numericPrice = parseFloat(price) || 0;
    const numericRental = rentalPricePerDay ? parseFloat(rentalPricePerDay) : null;

    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim(),
        category,
        condition,
        product_type: productType,
        price: numericPrice,
        rental_price_per_day: numericRental,
        rental_duration:
          productType === "For Rent" || productType === "Rent"
            ? rentalDuration
            : null,
        location: location.trim() || null,
        status,
        images,
      };

      if (initialProduct?.id) {
        await apiUpdateProduct(initialProduct.id, payload);
      } else {
        await createProduct(payload);
      }
      onSaved();
    } catch (err) {
      setFormError(
        err.response?.data?.detail || "Failed to save product. Please try again."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      onClose={onClose}
      title={initialProduct ? "Edit Product" : "List a New Product"}
    >
      <form className="space-y-4" onSubmit={handleSubmit}>
        {formError && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-600">
            {formError}
          </div>
        )}

        {/* Title */}
        <div>
          <label className="text-xs font-bold text-[#173126]">Product Title *</label>
          <input
            className="mt-1.5 w-full rounded-xl border border-[#dce7df] px-3 py-2.5 text-xs outline-none focus:border-[#08a649]"
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Casio fx-991EX Calculator / Operating Systems Book"
            required
            value={title}
          />
        </div>

        {/* Description */}
        <div>
          <label className="text-xs font-bold text-[#173126]">Description</label>
          <textarea
            className="mt-1.5 w-full rounded-xl border border-[#dce7df] px-3 py-2.5 text-xs outline-none focus:border-[#08a649]"
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the condition, highlights, notes included, semester used..."
            rows={3}
            value={description}
          />
        </div>

        {/* Category & Condition */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs font-bold text-[#173126]">Category *</label>
            <select
              className="mt-1.5 w-full rounded-xl border border-[#dce7df] bg-white px-3 py-2.5 text-xs outline-none focus:border-[#08a649]"
              onChange={(e) => setCategory(e.target.value)}
              value={category}
            >
              {categoriesList.map((c) => (
                <option key={c.id || c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-bold text-[#173126]">Condition *</label>
            <select
              className="mt-1.5 w-full rounded-xl border border-[#dce7df] bg-white px-3 py-2.5 text-xs outline-none focus:border-[#08a649]"
              onChange={(e) => setCondition(e.target.value)}
              value={condition}
            >
              <option>New</option>
              <option>Like New</option>
              <option>Used - Good</option>
              <option>Fair</option>
            </select>
          </div>
        </div>

        {/* Listing Type */}
        <div>
          <label className="text-xs font-bold text-[#173126]">Listing Type</label>
          <div className="mt-1.5 grid grid-cols-3 gap-2">
            {["For Sale", "For Rent", "Exchange"].map((option) => (
              <button
                className={`rounded-xl border p-2.5 text-xs font-bold transition ${
                  productType === option
                    ? "border-[#08a649] bg-[#edfbf1] text-[#078b3e]"
                    : "border-[#dce7df] text-[#697a70] hover:bg-[#f8faf8]"
                }`}
                key={option}
                onClick={() => setProductType(option)}
                type="button"
              >
                {option === "Exchange"
                  ? "🤝 Exchange"
                  : option === "For Rent"
                  ? "🔄 For Rent"
                  : "🏷️ For Sale"}
              </button>
            ))}
          </div>
        </div>

        {/* Pricing Options */}
        {productType !== "Exchange" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-bold text-[#173126]">
                {productType === "For Rent" ? "Deposit / Base Price (Rs.)" : "Price (Rs.) *"}
              </label>
              <input
                className="mt-1.5 w-full rounded-xl border border-[#dce7df] px-3 py-2.5 text-xs outline-none focus:border-[#08a649]"
                min="0"
                onChange={(e) => setPrice(e.target.value)}
                placeholder="Rs. 0"
                step="any"
                type="number"
                value={price}
              />
            </div>

            {productType === "For Rent" && (
              <div>
                <label className="text-xs font-bold text-[#173126]">
                  Rental Price Per Day (Rs.)
                </label>
                <input
                  className="mt-1.5 w-full rounded-xl border border-[#dce7df] px-3 py-2.5 text-xs outline-none focus:border-[#08a649]"
                  min="0"
                  onChange={(e) => setRentalPricePerDay(e.target.value)}
                  placeholder="Rs. 50"
                  step="any"
                  type="number"
                  value={rentalPricePerDay}
                />
              </div>
            )}
          </div>
        )}

        {productType === "For Rent" && (
          <div>
            <label className="text-xs font-bold text-[#173126]">Rental Duration Unit</label>
            <select
              className="mt-1.5 w-full rounded-xl border border-[#dce7df] bg-white px-3 py-2.5 text-xs outline-none focus:border-[#08a649]"
              onChange={(e) => setRentalDuration(e.target.value)}
              value={rentalDuration}
            >
              <option>Per day</option>
              <option>Per week</option>
              <option>Per month</option>
              <option>Per semester</option>
            </select>
          </div>
        )}

        {/* Location & Status */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs font-bold text-[#173126]">Campus Pickup Spot</label>
            <input
              className="mt-1.5 w-full rounded-xl border border-[#dce7df] px-3 py-2.5 text-xs outline-none focus:border-[#08a649]"
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Main Library, Student Centre"
              value={location}
            />
          </div>

          <div>
            <label className="text-xs font-bold text-[#173126]">Availability Status</label>
            <select
              className="mt-1.5 w-full rounded-xl border border-[#dce7df] bg-white px-3 py-2.5 text-xs outline-none focus:border-[#08a649]"
              onChange={(e) => setStatus(e.target.value)}
              value={status}
            >
              <option value="available">Available</option>
              <option value="rented">Rented Out</option>
              <option value="sold">Sold</option>
            </select>
          </div>
        </div>

        {/* Multi-Image Upload */}
        <div>
          <label className="text-xs font-bold text-[#173126]">
            Product Images ({images.length})
          </label>

          <label className="mt-2 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-[#c9dfcf] bg-[#f7fcf8] p-5 text-center transition hover:bg-[#edfbf1]">
            <UploadCloud className="text-[#08a649]" size={24} />
            <span className="mt-2 text-xs font-bold text-[#173126]">
              {uploadingImage ? "Processing & uploading…" : "Click or drop photos here"}
            </span>
            <span className="mt-1 text-[10px] text-[#8b9990]">
              Any image — auto-resized & compressed before upload
            </span>
            <input
              accept="image/*,.heic,.heif"
              className="hidden"
              disabled={uploadingImage}
              multiple
              onChange={handleImageFile}
              type="file"
            />
          </label>

          {/* Image Previews */}
          {images.length > 0 && (
            <div className="mt-3 grid grid-cols-4 gap-2">
              {images.map((img, idx) => (
                <div
                  className="relative aspect-square overflow-hidden rounded-xl border border-[#d8e6dc] bg-[#eef5f0]"
                  key={idx}
                >
                  <img alt="" className="size-full object-cover" src={img} />
                  {idx === 0 && (
                    <span className="absolute bottom-1 left-1 rounded bg-[#08a649] px-1.5 py-0.5 text-[8px] font-bold text-white">
                      Primary
                    </span>
                  )}
                  <button
                    aria-label="Remove image"
                    className="absolute right-1 top-1 grid size-5 place-items-center rounded-full bg-black/60 text-white hover:bg-red-600"
                    onClick={() => removeImage(idx)}
                    type="button"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="mt-6 flex justify-end gap-2 border-t border-[#edf1ed] pt-4">
          <button
            className="rounded-xl px-4 py-2 text-xs font-bold text-[#708077] hover:bg-neutral-100"
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="rounded-xl bg-[#08a649] px-5 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-[#078b3e] disabled:opacity-50"
            disabled={saving || !title.trim()}
            type="submit"
          >
            {saving
              ? "Saving…"
              : initialProduct
              ? "Update Listing"
              : "Publish Product"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/* Delete Confirmation Modal                                                  */
/* -------------------------------------------------------------------------- */
function DeleteModal({ product, onClose, onConfirm }) {
  const [deleting, setDeleting] = useState(false);

  async function handleConfirm() {
    setDeleting(true);
    await onConfirm();
    setDeleting(false);
  }

  return (
    <Modal onClose={onClose} title="Delete Product?">
      <p className="text-sm leading-6 text-[#687870]">
        Are you sure you want to delete{" "}
        <strong className="text-[#173126]">{product.title}</strong>? All
        associated images and reviews will be safely unlinked. This action cannot
        be undone.
      </p>
      <div className="mt-6 flex justify-end gap-2">
        <button
          className="rounded-xl px-4 py-2 text-xs font-bold text-[#708077] hover:bg-neutral-100"
          onClick={onClose}
          type="button"
        >
          Cancel
        </button>
        <button
          className="rounded-xl bg-[#b94d4d] px-5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-red-700 disabled:opacity-50"
          disabled={deleting}
          onClick={handleConfirm}
          type="button"
        >
          {deleting ? "Deleting…" : "Delete Product"}
        </button>
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/* Generic UI Shells                                                          */
/* -------------------------------------------------------------------------- */
function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#09231d]/60 p-4 backdrop-blur-sm">
      <div
        aria-modal="true"
        className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl"
        role="dialog"
      >
        <div className="mb-4 flex items-center justify-between border-b border-[#edf1ed] pb-3">
          <h2 className="text-lg font-black text-[#173126]">{title}</h2>
          <button
            aria-label="Close dialog"
            className="rounded-xl p-1.5 text-[#758279] transition hover:bg-[#f1f7f2]"
            onClick={onClose}
            type="button"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function PageShell({ eyebrow, title, children }) {
  return (
    <section className="mx-auto max-w-7xl px-4 py-8 sm:px-8">
      <div className="mb-7">
        <p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#278052]">
          {eyebrow}
        </p>
        <h1 className="mt-2 text-3xl font-black tracking-[-.04em] text-[#173126]">
          {title}
        </h1>
      </div>
      {children}
    </section>
  );
}

function MetricCard({ icon: Icon, label, value }) {
  return (
    <article className="rounded-2xl border border-[#dfe8e1] bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="grid size-9 place-items-center rounded-xl bg-[#e9f8ed] text-[#168044]">
          <Icon size={17} />
        </span>
        <TrendingUp className="text-[#a5c9ad]" size={15} />
      </div>
      <p className="mt-4 text-2xl font-black text-[#173126]">{value}</p>
      <p className="mt-1 text-[11px] text-[#7e8c84]">{label}</p>
    </article>
  );
}

function Footer() {
  return (
    <footer className="border-t border-[#e1e9e2] bg-white px-5 py-6 text-center text-[11px] text-[#87938a] sm:flex sm:items-center sm:justify-between sm:px-8">
      <strong className="text-[#168044]">UniSwap</strong>
      <span>Smart Student Marketplace &amp; Rental Platform · Member 2</span>
      <span>♻ Trade sustainably. Help the campus community.</span>
    </footer>
  );
}
