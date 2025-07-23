package main

import (
	"encoding/csv"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"github.com/PuerkitoBio/goquery"
	"github.com/gocolly/colly/v2"
	"github.com/gocolly/colly/v2/debug"
)

// we make a struct to handle all of attributes of the pokemon scraper ofr 151
type Product struct {
	Name          string
	Console       string
	LoosePrice    string
	CompletePrice string
	NewPrice      string
	GradedPrice   string
	URL           string
}

func main() {
	// Create a new collector object
	c := colly.NewCollector(
		colly.Debugger(&debug.LogDebugger{}),
		colly.UserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"),
	)

	// found out of rate limiting and how to implmenet it since, tcg does not like mutiple requests
	c.Limit(&colly.LimitRule{
		DomainGlob:  "*pricecharting.com*",
		Parallelism: 1,
		Delay:       2 * time.Second,
	})

	var products []Product

	// use the colly html object
	c.OnHTML("html", func(e *colly.HTMLElement) {
		fmt.Println("=== PAGE TITLE ===")
		fmt.Println(e.DOM.Find("title").Text())

		fmt.Println("\n=== TABLES FOUND ===")
		e.DOM.Find("table").Each(func(i int, s *goquery.Selection) {
			id, _ := s.Attr("id")
			class, _ := s.Attr("class")
			fmt.Printf("Table %d: id='%s', class='%s'\n", i, id, class)
		})
		fmt.Println("\n=== CHECKING COMMON SELECTORS ===")
		selectors := []string{
			"table#games_table tbody tr",
			"table tbody tr",
			".product-row",
			".search-result",
			"[data-product]",
			"tr[data-game-id]",
		}

		for _, selector := range selectors {
			count := e.DOM.Find(selector).Length()
			fmt.Printf("Selector '%s': %d elements\n", selector, count)
		}

		fmt.Println("\n=== FIRST FEW TABLE ROWS ===")
		e.DOM.Find("table tr").Each(func(i int, s *goquery.Selection) {
			if i < 5 { // Only first 5 rows
				text := strings.TrimSpace(s.Text())
				if text != "" {
					fmt.Printf("Row %d: %s\n", i, text[:min(100, len(text))])
				}
			}
		})
	})

	selectors := []string{
		"table#games_table tbody tr",
		"table tbody tr",
		"tr[data-game-id]",
		".product-row",
		".search-result",
	}

	for _, selector := range selectors {
		c.OnHTML(selector, func(e *colly.HTMLElement) {
			fmt.Printf("Found element with selector: %s\n", selector)

			product := Product{}

			nameSelectors := []string{
				"td:first-child a",
				"td:nth-child(1) a",
				"a[href*='/game/']",
				".product-name a",
				"td a",
			}

			for _, nameSelector := range nameSelectors {
				nameElement := e.DOM.Find(nameSelector)
				if nameElement.Length() > 0 {
					product.Name = strings.TrimSpace(nameElement.Text())
					href, exists := nameElement.Attr("href")
					if exists {
						if strings.HasPrefix(href, "/") {
							product.URL = "https://www.pricecharting.com" + href
						} else {
							product.URL = href
						}
					}
					fmt.Printf("Found name with selector '%s': %s\n", nameSelector, product.Name)
					break
				}
			}

			cells := e.DOM.Find("td")
			fmt.Printf("Number of cells in row: %d\n", cells.Length())

			if cells.Length() > 0 {
				cells.Each(func(i int, s *goquery.Selection) {
					text := strings.TrimSpace(s.Text())
					if text != "" && i < 8 { // Only show first 8 cells
						fmt.Printf("  Cell %d: %s\n", i, text)
					}
				})

				if cells.Length() >= 2 {
					// Usually: Name, Console, then prices
					if product.Name == "" {
						product.Name = strings.TrimSpace(cells.Eq(0).Find("a").Text())
						if product.Name == "" {
							product.Name = strings.TrimSpace(cells.Eq(0).Text())
						}
					}

					product.Console = strings.TrimSpace(cells.Eq(1).Text())

					if cells.Length() >= 6 {
						product.LoosePrice = strings.TrimSpace(cells.Eq(2).Text())
						product.CompletePrice = strings.TrimSpace(cells.Eq(3).Text())
						product.NewPrice = strings.TrimSpace(cells.Eq(4).Text())
						product.GradedPrice = strings.TrimSpace(cells.Eq(5).Text())
					}
				}
			}

			// Only add products with valid names
			if product.Name != "" && product.Name != "Product" && product.Name != "Game" {
				products = append(products, product)
				fmt.Printf("✓ Added product: %s (%s)\n", product.Name, product.Console)
			}
		})
	}

	// Handle pagination if it exists
	c.OnHTML("a.next_page", func(e *colly.HTMLElement) {
		nextURL := e.Attr("href")
		if nextURL != "" {
			fullURL := "https://www.pricecharting.com" + nextURL
			fmt.Printf("Following pagination: %s\n", fullURL)
			e.Request.Visit(fullURL)
		}
	})

	// Error handling
	c.OnError(func(r *colly.Response, err error) {
		fmt.Printf("Error scraping %s: %v\n", r.Request.URL, err)
	})

	// Log when starting and finishing requests
	c.OnRequest(func(r *colly.Request) {
		fmt.Printf("Visiting: %s\n", r.URL.String())
	})

	c.OnResponse(func(r *colly.Response) {
		fmt.Printf("Response received: %d bytes from %s\n", len(r.Body), r.Request.URL)
	})

	// we start scraping on the tcg player
	targetURL := "https://www.pricecharting.com/search-products?q=pokemon+151&type=prices"
	fmt.Printf("Starting to scrape: %s\n", targetURL)

	err := c.Visit(targetURL)
	if err != nil {
		log.Fatal("Error visiting URL:", err)
	}

	// Wait for all requests to complete
	c.Wait()

	fmt.Printf("\nScraping completed! Found %d products\n", len(products))

	// this we want to add it to the csv files
	if len(products) > 0 {
		saveToCSV(products)
	}

	// Print summary
	printSummary(products)
}

func saveToCSV(products []Product) {
	file, err := os.Create("pokemon_151_prices.csv")
	if err != nil {
		log.Printf("Error creating CSV file: %v\n", err)
		return
	}
	defer file.Close()

	writer := csv.NewWriter(file)
	defer writer.Flush()

	// Write header
	header := []string{"Name", "Console", "Loose Price", "Complete Price", "New Price", "Graded Price", "URL"}
	writer.Write(header)

	// Write data
	for _, product := range products {
		record := []string{
			product.Name,
			product.Console,
			product.LoosePrice,
			product.CompletePrice,
			product.NewPrice,
			product.GradedPrice,
			product.URL,
		}
		writer.Write(record)
	}

	fmt.Printf("Data saved to pokemon_151_prices.csv\n")
}

func printSummary(products []Product) {
	if len(products) == 0 {
		fmt.Println("No products were scraped. The website structure might have changed.")
		return
	}

	fmt.Println("\n=== SCRAPING SUMMARY ===")
	fmt.Printf("Total products found: %d\n", len(products))

	// Count by console
	consoleCount := make(map[string]int)
	for _, product := range products {
		consoleCount[product.Console]++
	}

	fmt.Println("\nBreakdown by console:")
	for console, count := range consoleCount {
		fmt.Printf("- %s: %d products\n", console, count)
	}

	// Show first few products as examples
	fmt.Println("\nFirst few products:")
	for i, product := range products {
		if i >= 5 { // Show only first 5
			break
		}
		fmt.Printf("%d. %s (%s) - Loose: %s\n",
			i+1, product.Name, product.Console, product.LoosePrice)
	}
}
