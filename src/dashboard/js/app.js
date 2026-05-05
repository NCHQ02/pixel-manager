import { store } from './store.js';
import { PixelRenderer } from './renderer.js';
import { showConfirm } from './modal.js';

// --- State & DOM Elements ---
let currentPlatform = "All";
let searchQuery = "";
let selectedTabId = "all";

const renderer = new PixelRenderer("events-table-body", "empty-state");

const searchInput = document.getElementById("global-search");
const tabSelector = document.getElementById("tab-selector");
const clearBtn = document.getElementById("clear-all-btn");

const tabAll = document.getElementById("tab-all");
const tabMeta = document.getElementById("tab-meta");
const tabTikTok = document.getElementById("tab-tiktok");

const heroSection = document.getElementById("hero-section");
const heroEyebrow = document.getElementById("hero-eyebrow");
const heroTitle = document.getElementById("hero-title");
const heroSubtitle = document.getElementById("hero-subtitle");

const heroContent = {
  All: {
    eyebrow: "The Event Canvas",
    title: "A real-time, unstructured stream of tracking pixels.",
    subtitle: "No secrets, no obfuscation. Watch data dispatch from your browser as it happens.",
    bg: "bg-lilac",
  },
  Meta: {
    eyebrow: "Meta Pixel",
    title: "Facebook event interception.",
    subtitle: "Monitoring PageViews, Lead events, and custom conversions dispatched to Meta.",
    bg: "bg-meta",
  },
  TikTok: {
    eyebrow: "TikTok Pixel",
    title: "TikTok tracking analytics.",
    subtitle: "Capturing auto-events, page interactions, and custom events routed to ByteDance.",
    bg: "bg-tiktok",
  },
};

// --- Logic ---

function updateUI() {
  let filteredEvents = [];
  
  if (selectedTabId === "all") {
    filteredEvents = store.getAllEvents();
  } else {
    filteredEvents = [...(store.events[selectedTabId] || [])];
    filteredEvents.sort((a, b) => b.timestamp - a.timestamp);
  }

  // Filter by Platform
  if (currentPlatform !== "All") {
    filteredEvents = filteredEvents.filter(e => e.platform === currentPlatform);
  }

  // Filter by Search Query
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filteredEvents = filteredEvents.filter(e => 
      e.eventName.toLowerCase().includes(q) ||
      e.pixelId.toLowerCase().includes(q) ||
      e.url.toLowerCase().includes(q)
    );
  }

  renderer.render(filteredEvents);
}

function updateTabSelector(eventsMap) {
  const currentVal = tabSelector.value;
  tabSelector.innerHTML = '<option value="all">All Browser Tabs</option>';
  
  const tabIds = Object.keys(eventsMap);
  tabIds.forEach(id => {
    if (id === "background_worker") return;
    
    // Find the latest URL for this tab to display as label
    const tabEvents = eventsMap[id];
    const latestUrl = tabEvents.length > 0 ? new URL(tabEvents[0].url).hostname : `Tab ${id}`;
    
    const option = document.createElement("option");
    option.value = id;
    option.textContent = `${latestUrl} (ID: ${id})`;
    tabSelector.appendChild(option);
  });

  // Restore selection if still exists
  if (tabIds.includes(currentVal)) {
    tabSelector.value = currentVal;
  } else {
    tabSelector.value = "all";
    selectedTabId = "all";
  }
}

function setPlatform(platform, btn) {
  currentPlatform = platform;
  document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");

  const content = heroContent[platform];
  if (content && heroSection) {
    heroEyebrow.textContent = content.eyebrow;
    heroTitle.textContent = content.title;
    heroSubtitle.textContent = content.subtitle;
    heroSection.classList.remove("bg-lilac", "bg-meta", "bg-tiktok");
    heroSection.classList.add(content.bg);
  }

  updateUI();
}

// --- Event Listeners ---

tabAll.addEventListener("click", () => setPlatform("All", tabAll));
tabMeta.addEventListener("click", () => setPlatform("Meta", tabMeta));
tabTikTok.addEventListener("click", () => setPlatform("TikTok", tabTikTok));

searchInput.addEventListener("input", (e) => {
  searchQuery = e.target.value;
  updateUI();
});

tabSelector.addEventListener("change", (e) => {
  selectedTabId = e.target.value;
  updateUI();
});

clearBtn.addEventListener("click", async () => {
  const confirmed = await showConfirm(
    "Clear Canvas?",
    "Are you sure you want to permanently delete all tracked events? This action cannot be undone."
  );
  if (confirmed) {
    store.clearAll();
  }
});

// --- Initialization ---

store.subscribe((eventsMap) => {
  updateTabSelector(eventsMap);
  updateUI();
});
