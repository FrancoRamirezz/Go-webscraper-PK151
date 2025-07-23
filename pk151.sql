CREATE TABLE cards (
    id SERIAL PRIMARY KEY,                   
    cardname VARCHAR(255) NOT NULL,              -- Card name
    set_name VARCHAR(255) NOT NULL,          -- Which set it belongs to
    card_number VARCHAR(50),                 -- Card number in set
    rarity VARCHAR(100),                     -- How rare the card is
    condition VARCHAR(50) DEFAULT 'Near Mint', -- Card condition
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(name, set_name, card_number, condition) 
);

CREATE TABLE prices (
    id SERIAL PRIMARY KEY,
    card_id INTEGER REFERENCES cards(id) ON DELETE CASCADE, -- Links to cards table
    source VARCHAR(255) NOT NULL,            -- Where price came from (TCGPlayer, etc.)
    price DECIMAL(10,2) NOT NULL,           -- The actual price
    currency VARCHAR(10) DEFAULT 'USD',     -- Currency type
    url TEXT,                               -- URL where price was found
    scraped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP -- When we got this price
);

-- this for the users when they interact with 

Create TABLE users(
    id PRIMARY Key,
    usersName Varchar(250) Not Null,  -- this means the name cant be empty
    email Varchar(255) Not NULL -- dont include passwords in sql
    userpasswords Varchar(50) NOT Null
);
