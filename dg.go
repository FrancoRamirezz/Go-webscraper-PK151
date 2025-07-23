package 

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gocolly/colly/v2"
	"github.com/gocolly/colly/v2/debug"
	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"
	_ "github.com/lib/pq"
	"github.com/rs/cors"
)

type Card struct {
	ID            int     `json:"id"`
	Name          string  `json:"name"`
	SetName       string  `json:"set_name"`
	CardNumber    string  `json:"card_number"`
	Rarity        string  `json:"rarity"`
	Condition     string  `json:"condition"`
	Price         float64 `json:"price"`
	Change        float64 `json:"change"`
	ChangePercent float64 `json:"changePercent"`
	Source        string  `json:"source"`
	Image         string  `json:"image"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

type Price struct {
	ID        int       `json:"id"`
	CardID    int       `json:"card_id"`
	Source    string    `json:"source"`
	Price     float64   `json:"price"`
	Currency  string    `json:"currency"`
	URL       string    `json:"url"`
	ScrapedAt time.Time `json:"scraped_at"`
}

type CardWithPrices struct {
	Card     Card    `json:"card"`
	Prices   []Price `json:"prices"`
	MinPrice float64 `json:"min_price"`
	MaxPrice float64 `json:"max_price"`
	AvgPrice float64 `json:"avg_price"`
}

type Database struct {
	conn *sql.DB
}

// WebSocket connection manager
type Hub struct {
	clients    map[*Client]bool
	broadcast  chan []byte
	register   chan *Client
	unregister chan *Client
	mutex      sync.RWMutex
}

type Client struct {
	hub  *Hub
	conn *websocket.Conn
	send chan []byte
}

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		// Allow connections from localhost:3000 (Next.js dev server)
		return true
	},
}

func newHub() *Hub {
	return &Hub{
		broadcast:  make(chan []byte),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		clients:    make(map[*Client]bool),
	}
}

func (h *Hub) run() {
	for {
		select {
		case client := <-h.register:
			h.mutex.Lock()
			h.clients[client] = true
			h.mutex.Unlock()
			log.Printf("Client connected. Total clients: %d", len(h.clients))

		case client := <-h.unregister:
			h.mutex.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.send)
			}
			h.mutex.Unlock()
			log.Printf("Client disconnected. Total clients: %d", len(h.clients))

		case message := <-h.broadcast:
			h.mutex.RLock()
			for client := range h.clients {
				select {
				case client.send <- message:
				default:
					close(client.send)
					delete(h.clients, client)
				}
			}
			h.mutex.RUnlock()
		}
	}
}

func (h *Hub) broadcastUpdate(cards []Card) {
	data, err := json.Marshal(cards)
	if err != nil {
		log.Printf("Error marshaling cards for broadcast: %v", err)
		return
	}
	
	select {
	case h.broadcast <- data:
		log.Printf("Broadcasting update to %d clients", len(h.clients))
	default:
		log.Println("No clients to broadcast to")
	}
}

func (c *Client) writePump() {
	ticker := time.NewTicker(54 * time.Second)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := c.conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			w.Write(message)

			if err := w.Close(); err != nil {
				return
			}

		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func (c *Client) readPump() {
	defer func() {
		c.hub.unregister <- c
		c.conn.Close()
	}()

	c.conn.SetReadLimit(512)
	c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	for {
		_, _, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("error: %v", err)
			}
			break
		}
	}
}

func getDBConnectionString() string {
	// Try to get connection string from environment variables first
	if dbURL := os.Getenv("DATABASE_URL"); dbURL != "" {
		return dbURL
	}

	// Otherwise, build from individual environment variables or use defaults
	host := getEnv("DB_HOST", "localhost")
	port := getEnv("DB_PORT", "5432")
	user := getEnv("DB_USER", "postgres")
	password := getEnv("DB_PASSWORD", "password")
	dbname := getEnv("DB_NAME", "pokemon_cards")
	sslmode := getEnv("DB_SSLMODE", "disable")

	return fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=%s",
		host, port, user, password, dbname, sslmode)
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func NewDatabase() (*Database, error) {
	connStr := getDBConnectionString()
	log.Printf("Connecting to database with connection string: %s", 
		strings.ReplaceAll(connStr, "password="+getEnv("DB_PASSWORD", "password"), "password=****"))
	
	db, err := sql.Open("postgres", connStr)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %v", err)
	}

	// Configure connection pool
	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(25)
	db.SetConnMaxLifetime(5 * time.Minute)

	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("failed to ping database: %v", err)
	}

	log.Println("Successfully connected to PostgreSQL database")

	database := &Database{conn: db}
	if err := database.createTables(); err != nil {
		return nil, fmt.Errorf("failed to create tables: %v", err)
	}

	return database, nil
}

func (db *Database) createTables() error {
	log.Println("Creating database tables if they don't exist...")
	
	cardTable := `
	CREATE TABLE IF NOT EXISTS cards (
		id SERIAL PRIMARY KEY,
		name VARCHAR(255) NOT NULL,
		set_name VARCHAR(255) NOT NULL,
		card_number VARCHAR(50),
		rarity VARCHAR(100),
		condition VARCHAR(50) DEFAULT 'Near Mint',
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		UNIQUE(name, set_name, card_number, condition)
	);`

	priceTable := `
	CREATE TABLE IF NOT EXISTS prices (
		id SERIAL PRIMARY KEY,
		card_id INTEGER REFERENCES cards(id) ON DELETE CASCADE,
		source VARCHAR(255) NOT NULL,
		price DECIMAL(10,2) NOT NULL,
		currency VARCHAR(10) DEFAULT 'USD',
		url TEXT,
		scraped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		INDEX idx_card_source_scraped (card_id, source, scraped_at DESC)
	);`

	// Create triggers for updating timestamps
	updateTrigger := `
	CREATE OR REPLACE FUNCTION update_updated_at_column()
	RETURNS TRIGGER AS $$
	BEGIN
		NEW.updated_at = CURRENT_TIMESTAMP;
		RETURN NEW;
	END;
	$$ language 'plpgsql';

	DROP TRIGGER IF EXISTS update_cards_updated_at ON cards;
	CREATE TRIGGER update_cards_updated_at
		BEFORE UPDATE ON cards
		FOR EACH ROW
		EXECUTE FUNCTION update_updated_at_column();`

	if _, err := db.conn.Exec(cardTable); err != nil {
		return fmt.Errorf("failed to create cards table: %v", err)
	}

	if _, err := db.conn.Exec(priceTable); err != nil {
		return fmt.Errorf("failed to create prices table: %v", err)
	}

	if _, err := db.conn.Exec(updateTrigger); err != nil {
		log.Printf("Warning: Failed to create update trigger: %v", err)
	}

	log.Println("Database tables created successfully")
	return nil
}

func (db *Database) InsertCard(card Card) (int, error) {
	var cardID int
	query := `
		INSERT INTO cards (name, set_name, card_number, rarity, condition) 
		VALUES ($1, $2, $3, $4, $5) 
		ON CONFLICT (name, set_name, card_number, condition) 
		DO UPDATE SET 
			updated_at = CURRENT_TIMESTAMP,
			rarity = EXCLUDED.rarity
		RETURNING id`
	
	err := db.conn.QueryRow(query, card.Name, card.SetName, card.CardNumber, card.Rarity, card.Condition).Scan(&cardID)
	if err != nil {
		return 0, fmt.Errorf("failed to insert/update card: %v", err)
	}
	
	log.Printf("Inserted/Updated card: %s (ID: %d)", card.Name, cardID)
	return cardID, nil
}

func (db *Database) InsertPrice(price Price) error {
	query := `INSERT INTO prices (card_id, source, price, currency, url, scraped_at) VALUES ($1, $2, $3, $4, $5, $6)`
	_, err := db.conn.Exec(query, price.CardID, price.Source, price.Price, price.Currency, price.URL, time.Now())
	if err != nil {
		return fmt.Errorf("failed to insert price: %v", err)
	}
	
	log.Printf("Inserted price: $%.2f for card ID %d from %s", price.Price, price.CardID, price.Source)
	return nil
}

// Enhanced method to get cards with better price calculations
func (db *Database) GetCardsForFrontend() ([]Card, error) {
	log.Println("Fetching cards for frontend...")
	
	query := `
		WITH latest_prices AS (
			SELECT DISTINCT ON (card_id, source) 
				card_id, source, price, scraped_at
			FROM prices 
			ORDER BY card_id, source, scraped_at DESC
		),
		previous_prices AS (
			SELECT DISTINCT ON (p.card_id, p.source) 
				p.card_id, p.source, p.price as prev_price
			FROM prices p
			WHERE p.scraped_at < (
				SELECT MAX(scraped_at) - INTERVAL '1 hour' 
				FROM prices p2 
				WHERE p2.card_id = p.card_id AND p2.source = p.source
			)
			ORDER BY p.card_id, p.source, p.scraped_at DESC
		),
		card_stats AS (
			SELECT 
				lp.card_id,
				AVG(lp.price) as avg_price,
				COUNT(DISTINCT lp.source) as source_count,
				STRING_AGG(DISTINCT lp.source, ', ' ORDER BY lp.source) as sources,
				AVG(COALESCE(lp.price - pp.prev_price, 0)) as avg_change,
				AVG(CASE 
					WHEN pp.prev_price IS NOT NULL AND pp.prev_price > 0 
					THEN ((lp.price - pp.prev_price) / pp.prev_price) * 100 
					ELSE 0 
				END) as avg_change_percent,
				MAX(lp.scraped_at) as last_scraped
			FROM latest_prices lp
			LEFT JOIN previous_prices pp ON lp.card_id = pp.card_id AND lp.source = pp.source
			GROUP BY lp.card_id
		)
		SELECT 
			c.id, c.name, c.set_name, c.card_number, c.rarity, c.condition,
			COALESCE(cs.avg_price, 0) as price,
			COALESCE(cs.avg_change, 0) as change,
			COALESCE(cs.avg_change_percent, 0) as change_percent,
			COALESCE(cs.sources, 'Unknown') as source,
			c.created_at, c.updated_at
		FROM cards c
		LEFT JOIN card_stats cs ON c.id = cs.card_id
		WHERE cs.avg_price IS NOT NULL AND cs.avg_price > 0
		ORDER BY cs.avg_price DESC, c.updated_at DESC
		LIMIT 100`

	rows, err := db.conn.Query(query)
	if err != nil {
		return nil, fmt.Errorf("failed to query cards: %v", err)
	}
	defer rows.Close()

	var cards []Card
	cardImages := map[string]string{
		"charizard": "🔥", "pikachu": "⚡", "mew": "💫", "alakazam": "🔮",
		"venusaur": "🌿", "blastoise": "🌊", "gengar": "👻", "dragonite": "🐉",
		"mewtwo": "🧬", "rayquaza": "🌟", "lucario": "⚔️", "garchomp": "🦈",
		"eevee": "🦊", "snorlax": "😴", "gyarados": "🐲", "machamp": "💪",
		"psyduck": "🦆", "magikarp": "🐟", "squirtle": "🐢", "bulbasaur": "🌱",
	}

	for rows.Next() {
		var card Card
		var source string
		
		err := rows.Scan(&card.ID, &card.Name, &card.SetName, &card.CardNumber, 
			&card.Rarity, &card.Condition, &card.Price, &card.Change, 
			&card.ChangePercent, &source, &card.CreatedAt, &card.UpdatedAt)
		if err != nil {
			return nil, fmt.Errorf("failed to scan card: %v", err)
		}

		card.Source = source
		
		// Assign emoji based on card name
		cardName := strings.ToLower(card.Name)
		card.Image = "🎴" // default
		for name, emoji := range cardImages {
			if strings.Contains(cardName, name) {
				card.Image = emoji
				break
			}
		}

		cards = append(cards, card)
	}

	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating over rows: %v", err)
	}

	log.Printf("Retrieved %d cards from database", len(cards))
	return cards, nil
}

type Scraper struct {
	db  *Database
	hub *Hub
}

func NewScraper(db *Database, hub *Hub) *Scraper {
	return &Scraper{db: db, hub: hub}
}

func (s *Scraper) ScrapePrices() error {
	log.Println("Starting price scraping...")
	
	c := colly.NewCollector(
		colly.Debugger(&debug.LogDebugger{}),
	)

	c.Limit(&colly.LimitRule{
		DomainGlob:  "*",
		Parallelism: 2,
		Delay:       2 * time.Second,
	})

	c.UserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"

	// Add some sample cards to test the system
	if err := s.seedSampleData(); err != nil {
		log.Printf("Error seeding sample data: %v", err)
	}

	// Scrape TCGPlayer (commented out for now as it requires proper selectors)
	// if err := s.scrapeTCGPlayer(c.Clone()); err != nil {
	// 	log.Printf("Error scraping TCGPlayer: %v", err)
	// }

	// Scrape PriceCharting (commented out for now as it requires proper selectors)
	// if err := s.scrapePriceCharting(c.Clone()); err != nil {
	// 	log.Printf("Error scraping PriceCharting: %v", err)
	// }

	// After scraping, get updated data and broadcast to clients
	cards, err := s.db.GetCardsForFrontend()
	if err != nil {
		log.Printf("Error getting cards for broadcast: %v", err)
		return err
	}

	s.hub.broadcastUpdate(cards)
	log.Printf("Scraping complete. Broadcasted %d cards to clients", len(cards))
	return nil
}

func (s *Scraper) seedSampleData() error {
	log.Println("Seeding sample data...")
	
	sampleCards := []struct {
		name   string
		set    string
		rarity string
		prices []struct {
			source string
			price  float64
		}
	}{
		{
			name:   "Charizard ex",
			set:    "Scarlet & Violet 151",
			rarity: "Special Illustration Rare",
			prices: []struct {
				source string
				price  float64
			}{
				{"TCGPlayer", 389.99 + float64(time.Now().Unix()%20) - 10}, // Add some variance
				{"PriceCharting", 395.50 + float64(time.Now().Unix()%15) - 7},
			},
		},
		{
			name:   "Pikachu ex",
			set:    "Scarlet & Violet 151",
			rarity: "Ultra Rare",
			prices: []struct {
				source string
				price  float64
			}{
				{"TCGPlayer", 124.50 + float64(time.Now().Unix()%10) - 5},
				{"PriceCharting", 128.75 + float64(time.Now().Unix()%8) - 4},
			},
		},
		{
			name:   "Mew ex",
			set:    "Scarlet & Violet 151",
			rarity: "Secret Rare",
			prices: []struct {
				source string
				price  float64
			}{
				{"TCGPlayer", 156.75 + float64(time.Now().Unix()%12) - 6},
				{"PriceCharting", 162.25 + float64(time.Now().Unix()%9) - 4},
			},
		},
	}

	for _, cardData := range sampleCards {
		card := Card{
			Name:      cardData.name,
			SetName:   cardData.set,
			Rarity:    cardData.rarity,
			Condition: "Near Mint",
		}

		cardID, err := s.db.InsertCard(card)
		if err != nil {
			log.Printf("Error inserting sample card %s: %v", card.Name, err)
			continue
		}

		for _, priceData := range cardData.prices {
			price := Price{
				CardID:   cardID,
				Source:   priceData.source,
				Price:    priceData.price,
				Currency: "USD",
				URL:      "https://example.com/sample-data",
			}

			if err := s.db.InsertPrice(price); err != nil {
				log.Printf("Error inserting sample price for %s: %v", card.Name, err)
			}
		}
	}

	log.Println("Sample data seeding completed")
	return nil
}

func (s *Scraper) scrapeTCGPlayer(c *colly.Collector) error {
	log.Println("Scraping TCGPlayer...")

	c.OnHTML(".search-result", func(e *colly.HTMLElement) {
		name := strings.TrimSpace(e.ChildText(".card-name"))
		priceText := strings.TrimSpace(e.ChildText(".market-price"))
		
		if name == "" || priceText == "" {
			return
		}

		price := extractPrice(priceText)
		if price <= 0 {
			return
		}

		card := Card{
			Name:      name,
			SetName:   "Scarlet & Violet 151",
			Rarity:    strings.TrimSpace(e.ChildText(".rarity")),
			Condition: "Near Mint",
		}

		cardID, err := s.db.InsertCard(card)
		if err != nil {
			log.Printf("Error inserting card: %v", err)
			return
		}

		priceEntry := Price{
			CardID:   cardID,
			Source:   "TCGPlayer",
			Price:    price,
			Currency: "USD",
			URL:      e.Request.URL.String(),
		}

		if err := s.db.InsertPrice(priceEntry); err != nil {
			log.Printf("Error inserting price: %v", err)
		}
	})

	return c.Visit("https://www.tcgplayer.com/categories/trading-and-collectible-card-games/pokemon/price-guides/sv-scarlet-and-violet-151")
}

func (s *Scraper) scrapePriceCharting(c *colly.Collector) error {
	log.Println("Scraping PriceCharting...")

	c.OnHTML("tr", func(e *colly.HTMLElement) {
		name := strings.TrimSpace(e.ChildText(".title"))
		priceText := strings.TrimSpace(e.ChildText(".price"))
		
		if name == "" || priceText == "" {
			return
		}

		price := extractPrice(priceText)
		if price <= 0 {
			return
		}

		card := Card{
			Name:      name,
			SetName:   "Scarlet & Violet 151",
			Condition: "Near Mint",
		}

		cardID, err := s.db.InsertCard(card)
		if err != nil {
			log.Printf("Error inserting card: %v", err)
			return
		}

		priceEntry := Price{
			CardID:   cardID,
			Source:   "PriceCharting",
			Price:    price,
			Currency: "USD",
			URL:      e.Request.URL.String(),
		}

		if err := s.db.InsertPrice(priceEntry); err != nil {
			log.Printf("Error inserting price: %v", err)
		}
	})

	return c.Visit("https://www.pricecharting.com/search-products?q=pokemon+151&type=prices")
}

func extractPrice(priceText string) float64 {
	// Remove currency symbols and extract numeric value
	re := regexp.MustCompile(`[\d,]+\.?\d*`)
	matches := re.FindString(strings.ReplaceAll(priceText, ",", ""))
	
	if matches == "" {
		return 0
	}

	price, err := strconv.ParseFloat(matches, 64)
	if err != nil {
		return 0
	}

	return price
}

// API Handlers
func (db *Database) handleGetCards(w http.ResponseWriter, r *http.Request) {
	cards, err := db.GetCardsForFrontend()
	if err != nil {
		log.Printf("Error getting cards: %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(cards); err != nil {
		log.Printf("Error encoding cards response: %v", err)
		http.Error(w, "Error encoding response", http.StatusInternalServerError)
		return
	}
}

func (db *Database) handleScrapeNow(hub *Hub) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		log.Println("Manual scrape triggered via API")
		
		go func() {
			scraper := NewScraper(db, hub)
			if err := scraper.ScrapePrices(); err != nil {
				log.Printf("Manual scrape failed: %v", err)
			}
		}()

		w.Header().Set("Content-Type", "application/json")
		response := map[string]interface{}{
			"status":    "scraping started",
			"timestamp": time.Now().Format(time.RFC3339),
		}
		json.NewEncoder(w).Encode(response)
	}
}

func handleWebSocket(hub *Hub, w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade error: %v", err)
		return
	}

	client := &Client{hub: hub, conn: conn, send: make(chan []byte, 256)}
	client.hub.register <- client

	go client.writePump()
	go client.readPump()
}

func main() {
	log.Println("Starting Pokemon Card Price Tracker...")
	
	db, err := NewDatabase()
	if err != nil {
		log.Fatal("Failed to initialize database:", err)
	}
	defer db.conn.Close()

	// Initialize WebSocket hub
	hub := newHub()
	go hub.run()

	// Start periodic scraping
	go func() {
		scraper := NewScraper(db, hub)
		ticker := time.NewTicker(30 * time.Minute) // Scrape every 30 minutes
		defer ticker.Stop()

		// Initial scrape
		log.Println("Starting initial scrape...")
		if err := scraper.ScrapePrices(); err != nil {
			log.Printf("Initial scrape failed: %v", err)
		}

		for {
			select {
			case <-ticker.C:
				log.Println("Starting scheduled scrape...")
				if err := scraper.ScrapePrices(); err != nil {
					log.Printf("Scheduled scrape failed: %v", err)
				}
			}
		}
	}()

	// Setup API routes
	r := mux.NewRouter()
	
	// WebSocket endpoint
	r.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		handleWebSocket(hub, w, r)
	})
	
	// API routes
	api := r.PathPrefix("/api").Subrouter()
	api.HandleFunc("/cards", db.handleGetCards).Methods("GET")
	api.HandleFunc("/scrape", db.handleScrapeNow(hub)).Methods("POST")

	// Health check endpoint
	api.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"status": "healthy",
			"time":   time.Now().Format(time.RFC3339),
		})
	}).Methods("GET")

	// CORS middleware
	c := cors.New(cors.Options{
		AllowedOrigins: []string{"http://localhost:3000", "http://localhost:3001"},
		AllowedMethods: []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders: []string{"*"},
		AllowCredentials: true,
	})

	handler := c.Handler(r)

	port := getEnv("PORT", "8080")
	fmt.Printf("Server starting on port %s\n", port)
	fmt.Println("API endpoints:")
	fmt.Println("  GET  /api/cards   - Get all cards with prices")
	fmt.Println("  POST /api/scrape  - Trigger manual scrape")
	fmt.Println("  GET  /api/health  - Health check")
	fmt.Println("  WS   /ws          - WebSocket for real-time updates")
	fmt.Println("\nDatabase configuration:")
	fmt.Printf("  Host: %s\n", getEnv("DB_HOST", "localhost"))
	fmt.Printf("  Port: %s\n", getEnv("DB_PORT", "5432"))
	fmt.Printf("  Database: %s\n", getEnv("DB_NAME", "pokemon_cards"))
	fmt.Printf("  User: %s\n", getEnv("DB_USER", "postgres"))
	
	log.Fatal(http.ListenAndServe(":"+port, handler))
}