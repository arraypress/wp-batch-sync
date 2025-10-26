# Batch Sync Manager for WordPress

A clean, modern batch processing library for WordPress with real-time progress tracking and a beautiful modal UI.

## Features

- 🚀 **Batch Processing** - Process large datasets in manageable chunks
- 📊 **Real-time Progress** - Live progress bar, counters, and activity log
- 🎯 **Modal UI** - Professional, non-intrusive interface
- ⚡ **Performance** - Handles thousands of items without timeout issues
- 🔄 **Auto-refresh** - Optional page reload after completion
- 📋 **Activity Log** - Detailed logging with timestamps
- 📎 **Copy Log** - One-click clipboard export for debugging
- ❌ **Error Tracking** - Live failed counter and detailed error messages

## Installation

```bash
composer require arraypress/wp-batch-sync
```

## Basic Usage

### 1. Initialize the Manager

```php
use ArrayPress\BatchSync\Manager;

$batch_sync = new Manager( 'my_sync' );
```

### 2. Register a Sync Handler

```php
$batch_sync->register( 'sync_products', [
    'callback'    => [ $this, 'sync_products_callback' ],
    'title'       => 'Sync Products',
    'description' => 'Sync products from Stripe',
    'button_text' => 'Start Sync',
    'singular'    => 'product',
    'plural'      => 'products',
    'limit'       => 10,           // Items per batch
    'auto_close'  => true,         // Auto-close modal on success
] );
```

### 3. Add a Trigger Button

```php
// In your admin page
$batch_sync->button( 'sync_products' );
```

### 4. Create Your Callback

```php
public function sync_products_callback( string $starting_after, int $limit, array $options ): array {
    // Fetch your items (API, database, etc.)
    $products = $this->get_products( $starting_after, $limit );
    
    $results = [
        'items'           => [],
        'has_more'        => count( $products ) === $limit,
        'last_id'         => end( $products )['id'] ?? '',
        'estimated_total' => 100, // Optional: total items count
    ];
    
    foreach ( $products as $product ) {
        $item = [
            'id'    => $product['id'],
            'name'  => $product['name'],
            'error' => null
        ];
        
        try {
            // Process the item
            $this->process_product( $product );
        } catch ( Exception $e ) {
            $item['error'] = $e->getMessage();
        }
        
        $results['items'][] = $item;
    }
    
    return $results;
}
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `callback` | callable | **required** | Function to process each batch |
| `title` | string | 'Sync Data' | Modal title |
| `description` | string | '' | Optional description shown in modal |
| `button_text` | string | 'Sync Now' | Button text |
| `singular` | string | 'item' | Singular item name |
| `plural` | string | 'items' | Plural item name |
| `limit` | int | 10 | Items per batch |
| `capability` | string | 'manage_options' | Required user capability |
| `icon` | string | 'update' | Dashicon name (without 'dashicons-') |
| `auto_close` | bool | false | Auto-close modal and refresh on success |
| `notice_target` | string | '.wrap h1' | CSS selector for success notice placement |

## Callback Return Format

Your callback must return an array with:

```php
[
    'items' => [                    // Array of processed items
        [
            'id'    => '123',       // Item identifier
            'name'  => 'Item Name', // Display name
            'error' => null         // Error message or null
        ],
        // ... more items
    ],
    'has_more'        => true,      // Are there more items to process?
    'last_id'         => '123',     // Last processed ID (for pagination)
    'estimated_total' => 100,       // Optional: Total items (for progress bar)
]
```

## How It Works

1. **User clicks button** → Modal opens
2. **User starts sync** → Button shows spinning icon
3. **First batch** → Callback returns items + `estimated_total`
4. **Progress updates** → UI shows: "10 / 100" (10%)
5. **Next batch** → Uses `last_id` for pagination
6. **Repeats** → Until `has_more` is false
7. **Completion** → Shows summary, copy log button appears

## UI Components

### Progress Display
```
PROGRESS    PROCESSED    FAILED
45%         45 / 100     2
```

### Activity Log
Real-time updates with timestamps:
```
01:23:45 ✓ Product ABC synced
01:23:46 ✗ Product XYZ - API error
```

### Final Message
- ✅ Success: "Sync complete! 100 products synced."
- ⚠️ Partial: "Sync complete! 100 products processed. 97 succeeded, 3 failed."

## Example: Stripe Products Sync

```php
public function sync_stripe_products( string $starting_after, int $limit, array $options ): array {
    \Stripe\Stripe::setApiKey( STRIPE_SECRET_KEY );
    
    $params = [ 'limit' => $limit ];
    if ( $starting_after ) {
        $params['starting_after'] = $starting_after;
    }
    
    $products = \Stripe\Product::all( $params );
    
    $results = [
        'items'           => [],
        'has_more'        => $products->has_more,
        'last_id'         => $products->data ? end( $products->data )->id : '',
        'estimated_total' => 100, // Or fetch from Stripe
    ];
    
    foreach ( $products->data as $product ) {
        $item = [
            'id'    => $product->id,
            'name'  => $product->name,
            'error' => null
        ];
        
        try {
            // Create/update WooCommerce product
            $wc_product_id = $this->create_wc_product( $product );
            update_post_meta( $wc_product_id, '_stripe_product_id', $product->id );
        } catch ( Exception $e ) {
            $item['error'] = $e->getMessage();
        }
        
        $results['items'][] = $item;
    }
    
    return $results;
}
```

## Best Practices

### Batch Size
- **API calls**: 10-20 items (avoid rate limits)
- **Database operations**: 50-100 items
- **Heavy processing**: 5-10 items

### Error Handling
```php
try {
    $this->process_item( $item );
} catch ( Exception $e ) {
    // Return error in item, don't throw
    $item['error'] = $e->getMessage();
}
```

### Performance
- Use `estimated_total` for accurate progress
- Add small delays for API calls: `usleep(50000)` (50ms)
- Process in manageable chunks
- Don't process all data at once

### User Experience
- Set `auto_close => true` for simple syncs
- Use clear, descriptive messages
- Provide estimated totals when possible
- Test with failures to see error handling

## Requirements

- WordPress 5.0+
- PHP 7.4+
- jQuery (included with WordPress)

## License

MIT

## Support

For issues and feature requests, please use GitHub issues.