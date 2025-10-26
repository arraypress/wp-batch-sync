<?php
/**
 * Batch Sync Manager
 *
 * Main class for managing batch synchronization operations with modal UI.
 * Each plugin instantiates its own Manager with a unique prefix.
 *
 * @package     ArrayPress\BatchSync
 * @copyright   Copyright (c) 2025, ArrayPress Limited
 * @license     GPL2+
 * @version     1.0.0
 * @author      David Sherlock
 */

declare( strict_types=1 );

namespace ArrayPress\BatchSync;

/**
 * Class Manager
 *
 * Manages batch synchronization operations for a single plugin instance.
 *
 * @since 1.0.0
 */
class Manager {

    /**
     * Unique prefix for this instance
     *
     * @var string
     */
    private string $prefix;

    /**
     * Registered sync handlers
     *
     * @var array
     */
    private array $handlers = [];

    /**
     * Whether assets have been enqueued
     *
     * @var bool
     */
    private bool $assets_enqueued = false;

    /**
     * Constructor
     *
     * @param string $prefix Unique prefix for this instance (e.g., 'sugarcart')
     *
     * @since 1.0.0
     */
    public function __construct( string $prefix ) {
        $this->prefix = sanitize_key( $prefix );

        $this->hooks();
    }

    /**
     * Setup WordPress hooks
     *
     * @return void
     * @since 1.0.0
     */
    private function hooks(): void {
        add_action( 'admin_enqueue_scripts', [ $this, 'enqueue_assets' ] );
        add_action( "wp_ajax_batch_sync_{$this->prefix}", [ $this, 'handle_ajax' ] );
        add_action( 'admin_footer', [ $this, 'render_modals' ] );
    }

    /**
     * Register a sync handler
     *
     * @param string  $id            Unique identifier for this sync operation
     * @param array   $args          {
     *                               Sync handler configuration
     *
     * @type callable $callback      Function to call for syncing (receives: $starting_after, $limit, $options)
     * @type string   $title         Modal title
     * @type string   $description   Optional description shown in modal
     * @type string   $button_text   Button text (default: "Sync Now")
     * @type string   $singular      Singular item name (e.g., "price")
     * @type string   $plural        Plural item name (e.g., "prices")
     * @type int      $limit         Items per batch - how many items to process at once (default: 10)
     * @type string   $capability    Required capability (default: 'manage_options')
     * @type string   $icon          Dashicon name (default: 'update')
     * @type array    $options       Default options passed to callback
     * @type bool     $auto_close    Auto-close modal on completion (default: false)
     * @type string   $notice_target CSS selector for notice placement (default: '.wrap h1')
     *                               }
     *
     * @return void
     * @since 1.0.0
     */
    public function register( string $id, array $args ): void {
        $this->handlers[ $id ] = wp_parse_args( $args, [
                'callback'      => '',
                'title'         => __( 'Sync Data', 'arraypress' ),
                'description'   => '',
                'button_text'   => __( 'Sync Now', 'arraypress' ),
                'singular'      => 'item',
                'plural'        => 'items',
                'limit'         => 10,
                'capability'    => 'manage_options',
                'icon'          => 'update',
                'options'       => [],
                'auto_close'    => false,
                'notice_target' => '.wrap h1',
        ] );
    }

    /**
     * Render a sync button
     *
     * Outputs the button HTML directly.
     *
     * @param string $id   Handler ID
     * @param array  $args Optional button arguments to override handler defaults
     *
     * @return void
     * @since 1.0.0
     */
    public function button( string $id, array $args = [] ): void {
        echo $this->get_button( $id, $args );
    }

    /**
     * Get button HTML
     *
     * Returns the button HTML without outputting it.
     *
     * @param string $id   Handler ID
     * @param array  $args Optional button arguments to override handler defaults
     *
     * @return string Button HTML or empty string if handler not found
     * @since 1.0.0
     */
    public function get_button( string $id, array $args = [] ): string {
        if ( ! isset( $this->handlers[ $id ] ) ) {
            return '';
        }

        $handler = $this->handlers[ $id ];

        // Check capability
        if ( ! current_user_can( $handler['capability'] ) ) {
            return '';
        }

        // Allow overriding button text and icon
        $button_text = $args['button_text'] ?? $handler['button_text'];
        $icon        = $args['icon'] ?? $handler['icon'];

        // Generate nonce
        $nonce = wp_create_nonce( "batch_sync_{$this->prefix}_{$id}" );

        // Build button
        ob_start();
        ?>
        <button type="button"
                class="button button-primary batch-sync-trigger"
                data-sync-prefix="<?php echo esc_attr( $this->prefix ); ?>"
                data-sync-id="<?php echo esc_attr( $id ); ?>"
                data-sync-nonce="<?php echo esc_attr( $nonce ); ?>">
            <?php if ( $icon ): ?>
                <span class="dashicons dashicons-<?php echo esc_attr( $icon ); ?>"></span>
            <?php endif; ?>
            <span class="batch-sync-button-text"><?php echo esc_html( $button_text ); ?></span>
        </button>
        <?php
        return ob_get_clean();
    }

    /**
     * Enqueue assets
     *
     * @return void
     * @since 1.0.0
     */
    public function enqueue_assets(): void {
        // Only enqueue once
        if ( $this->assets_enqueued ) {
            return;
        }

        // Only enqueue if we have handlers
        if ( empty( $this->handlers ) ) {
            return;
        }

        $base_file = __FILE__;
        $handle    = "batch-sync-{$this->prefix}";
        $version   = defined( 'WP_DEBUG' ) && WP_DEBUG ? time() : '1.0.0';

        // Register and enqueue JavaScript using composer helper
        wp_register_composer_script(
                $handle,
                $base_file,
                'js/batch-sync.js',
                [ 'jquery' ],
                $version,
                true
        );
        wp_enqueue_script( $handle );

        // Register and enqueue CSS using composer helper
        wp_register_composer_style(
                $handle,
                $base_file,
                'css/batch-sync.css',
                [],
                $version
        );
        wp_enqueue_style( $handle );

        // Localize script
        wp_localize_script(
                $handle,
                'batchSyncConfig',
                [
                        'ajaxUrl'  => admin_url( 'admin-ajax.php' ),
                        'prefix'   => $this->prefix,
                        'handlers' => $this->get_handler_configs(),
                        'strings'  => $this->get_strings(),
                ]
        );

        $this->assets_enqueued = true;
    }

    /**
     * Get handler configurations for JavaScript
     *
     * @return array Handler configurations without callbacks
     * @since 1.0.0
     */
    private function get_handler_configs(): array {
        $configs = [];

        foreach ( $this->handlers as $id => $handler ) {
            $configs[ $id ] = [
                    'title'        => $handler['title'],
                    'description'  => $handler['description'],
                    'singular'     => $handler['singular'],
                    'plural'       => $handler['plural'],
                    'limit'        => $handler['limit'],
                    'autoClose'    => $handler['auto_close'],
                    'noticeTarget' => $handler['notice_target'],
            ];
        }

        return $configs;
    }

    /**
     * Get localized strings for JavaScript
     *
     * @return array Translatable strings
     * @since 1.0.0
     */
    private function get_strings(): array {
        return [
                'syncing'       => __( 'Syncing...', 'arraypress' ),
                'processing'    => __( 'Processing:', 'arraypress' ),
                'synced'        => __( 'synced', 'arraypress' ),
                'failed'        => __( 'failed', 'arraypress' ),
                'complete'      => __( 'Sync complete!', 'arraypress' ),
                'error'         => __( 'Error:', 'arraypress' ),
                'close'         => __( 'Close', 'arraypress' ),
                'cancel'        => __( 'Cancel', 'arraypress' ),
                'confirmCancel' => __( 'Are you sure you want to cancel the sync?', 'arraypress' ),
                'startSync'     => __( 'Start Sync', 'arraypress' ),
                'progress'      => __( 'Progress', 'arraypress' ),
                'processed'     => __( 'Processed', 'arraypress' ),
                'status'        => __( 'Status', 'arraypress' ),
                'activityLog'   => __( 'Activity Log', 'arraypress' ),
                'noItems'       => __( 'No items to sync', 'arraypress' ),
                'copyLog'       => __( 'Copy Log', 'arraypress' ),
                'logCopied'     => __( 'Log copied to clipboard!', 'arraypress' ),
        ];
    }

    /**
     * Render modal HTML
     *
     * Outputs modal structure in admin footer for all registered handlers.
     *
     * @return void
     * @since 1.0.0
     */
    public function render_modals(): void {
        if ( empty( $this->handlers ) ) {
            return;
        }

        foreach ( $this->handlers as $id => $handler ) {
            $modal_id = "batch-sync-modal-{$this->prefix}-{$id}";
            ?>
            <div id="<?php echo esc_attr( $modal_id ); ?>"
                 class="batch-sync-modal"
                 style="display: none;">
                <div class="batch-sync-modal-backdrop"></div>
                <div class="batch-sync-modal-content">
                    <div class="batch-sync-modal-header">
                        <h2><?php echo esc_html( $handler['title'] ); ?></h2>
                        <button type="button" class="batch-sync-modal-close-x"
                                aria-label="<?php esc_attr_e( 'Close', 'arraypress' ); ?>">
                            <span class="dashicons dashicons-no-alt"></span>
                        </button>
                    </div>

                    <div class="batch-sync-modal-body">
                        <?php if ( ! empty( $handler['description'] ) ): ?>
                            <p class="batch-sync-description"><?php echo wp_kses_post( $handler['description'] ); ?></p>
                        <?php endif; ?>

                        <div class="batch-sync-stats">
                            <div class="batch-sync-stat">
                                <span class="batch-sync-stat-label"><?php _e( 'Progress', 'arraypress' ); ?></span>
                                <span class="batch-sync-stat-value batch-sync-percentage">0%</span>
                            </div>
                            <div class="batch-sync-stat">
                                <span class="batch-sync-stat-label"><?php _e( 'Processed', 'arraypress' ); ?></span>
                                <span class="batch-sync-stat-value">
									<span class="batch-sync-current">0</span> /
									<span class="batch-sync-total">0</span>
								</span>
                            </div>
                            <div class="batch-sync-stat">
                                <span class="batch-sync-stat-label"><?php _e( 'Failed', 'arraypress' ); ?></span>
                                <span class="batch-sync-stat-value batch-sync-failed">0</span>
                            </div>
                        </div>

                        <div class="batch-sync-progress-bar">
                            <div class="batch-sync-progress-fill"></div>
                        </div>

                        <div class="batch-sync-status"></div>

                        <div class="batch-sync-log">
                            <h3><?php _e( 'Activity Log', 'arraypress' ); ?></h3>
                            <div class="batch-sync-log-entries"></div>
                        </div>
                    </div>

                    <div class="batch-sync-modal-footer">
                        <button type="button" class="button button-primary batch-sync-start">
                            <span class="dashicons dashicons-<?php echo esc_attr( $handler['icon'] ); ?>"></span>
                            <?php echo esc_html( $handler['button_text'] ); ?>
                        </button>
                        <button type="button" class="button batch-sync-modal-close">
                            <?php _e( 'Close', 'arraypress' ); ?>
                        </button>
                    </div>
                </div>
            </div>
            <?php
        }
    }

    /**
     * Handle AJAX request
     *
     * @return void
     * @since 1.0.0
     */
    public function handle_ajax(): void {
        // Get parameters
        $id             = sanitize_text_field( $_POST['sync_id'] ?? '' );
        $starting_after = sanitize_text_field( $_POST['starting_after'] ?? '' );
        $limit          = absint( $_POST['limit'] ?? 10 );
        $options        = json_decode( stripslashes( $_POST['options'] ?? '{}' ), true ) ?? [];

        // Verify handler exists
        if ( ! isset( $this->handlers[ $id ] ) ) {
            wp_send_json_error( __( 'Invalid sync handler', 'arraypress' ), 400 );
        }

        $handler = $this->handlers[ $id ];

        // Verify nonce
        if ( ! check_ajax_referer( "batch_sync_{$this->prefix}_{$id}", '_wpnonce', false ) ) {
            wp_send_json_error( __( 'Invalid security token', 'arraypress' ), 403 );
        }

        // Check capability
        if ( ! current_user_can( $handler['capability'] ) ) {
            wp_send_json_error( __( 'Insufficient permissions', 'arraypress' ), 403 );
        }

        // Verify callback is callable
        if ( ! is_callable( $handler['callback'] ) ) {
            wp_send_json_error( __( 'Invalid callback function', 'arraypress' ), 500 );
        }

        try {
            // Merge default options with request options
            $merged_options = array_merge( $handler['options'], $options );

            // Call the callback
            $result = call_user_func( $handler['callback'], $starting_after, $limit, $merged_options );

            // Validate result format
            if ( ! is_array( $result ) || ! isset( $result['items'], $result['has_more'], $result['last_id'] ) ) {
                wp_send_json_error( __( 'Invalid callback response format', 'arraypress' ), 500 );
            }

            // Calculate counts if not provided
            if ( ! isset( $result['processed'] ) || ! isset( $result['failed'] ) ) {
                $processed = 0;
                $failed    = 0;

                foreach ( $result['items'] as $item ) {
                    if ( ! empty( $item['error'] ) ) {
                        $failed ++;
                    } else {
                        $processed ++;
                    }
                }

                $result['processed'] = $processed;
                $result['failed']    = $failed;
            }

            wp_send_json_success( $result );

        } catch ( \Exception $e ) {
            wp_send_json_error( $e->getMessage(), 500 );
        }
    }

    /**
     * Get the prefix for this instance
     *
     * @return string
     * @since 1.0.0
     */
    public function get_prefix(): string {
        return $this->prefix;
    }

    /**
     * Get all registered handlers
     *
     * @return array
     * @since 1.0.0
     */
    public function get_handlers(): array {
        return $this->handlers;
    }

}