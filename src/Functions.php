<?php
/**
 * Batch Sync Core Helper Functions
 *
 * Core functionality helpers for batch sync system initialization and management.
 * These global functions provide a simplified API for batch sync registration and usage.
 *
 * @package     ArrayPress\BatchSync
 * @copyright   Copyright (c) 2025, ArrayPress Limited
 * @license     GPL2+
 * @version     2.0.0
 * @since       2.0.0
 * @author      David Sherlock
 */

declare( strict_types=1 );

use ArrayPress\BatchSync\Manager;
use ArrayPress\BatchSync\Registry;

if ( ! function_exists( 'register_batch_sync' ) ) {
	/**
	 * Register a batch sync handler with automatic manager handling
	 *
	 * This is the simplified global registration method that automatically
	 * creates and manages Manager instances through the Registry pattern.
	 *
	 * The ID should follow the pattern: 'prefix_sync_name'
	 * (e.g., 'stripe_sync_products', 'woo_import_orders')
	 *
	 * The prefix (first part before underscore) becomes the manager namespace,
	 * and the rest becomes the sync ID within that manager.
	 *
	 * @param string $id     Full sync identifier (prefix_name format)
	 * @param array  $config {
	 *                       Sync handler configuration
	 *
	 *     @type callable $callback      Function to call for syncing (receives: $starting_after, $limit, $options)
	 *     @type string   $title         Modal title
	 *     @type string   $description   Optional description shown in modal
	 *     @type string   $button_text   Button text (default: "Sync Now")
	 *     @type string   $singular      Singular item name (e.g., "price")
	 *     @type string   $plural        Plural item name (e.g., "prices")
	 *     @type int      $limit         Items per batch (default: 10)
	 *     @type string   $capability    Required capability (default: 'manage_options')
	 *     @type string   $icon          Dashicon name (default: 'update')
	 *     @type array    $options       Default options passed to callback
	 *     @type bool     $auto_close    Auto-close modal on completion (default: false)
	 *     @type string   $notice_target CSS selector for notice placement (default: '.wrap h1')
	 * }
	 *
	 * @return Manager|null The manager instance or null if registration failed
	 * @since 2.0.0
	 */
	function register_batch_sync( string $id, array $config = [] ): ?Manager {
		try {
			// Use registry helper to parse ID
			$components = Registry::parse_sync_id( $id );

			// Get manager from registry
			$registry = Registry::get_instance();
			$manager  = $registry->get_manager( $components['prefix'] );

			// Register the sync handler with the manager
			$manager->register( $components['sync_id'], $config );

			return $manager;

		} catch ( Exception $e ) {
			error_log( sprintf(
				'Batch Sync: Failed to register sync "%s" - %s',
				$id,
				$e->getMessage()
			) );

			return null;
		}
	}
}

if ( ! function_exists( 'get_batch_sync_button' ) ) {
	/**
	 * Get a batch sync trigger button HTML
	 *
	 * This is a convenience function that works with the global registration.
	 * It automatically determines the correct manager from the sync ID using the Registry.
	 *
	 * @param string $id   Full sync identifier (same as used in register_batch_sync)
	 * @param array  $args {
	 *                     Button configuration to override defaults
	 *
	 *     @type string $button_text Button text to override handler default
	 *     @type string $icon        Dashicon name (without 'dashicons-' prefix)
	 * }
	 *
	 * @return string Button HTML or empty string if sync not found or unauthorized
	 * @since 2.0.0
	 */
	function get_batch_sync_button( string $id, array $args = [] ): string {
		try {
			$components = Registry::parse_sync_id( $id );
			$registry   = Registry::get_instance();

			if ( ! $registry->has_manager( $components['prefix'] ) ) {
				return '';
			}

			$manager = $registry->get_manager( $components['prefix'] );

			// Check if handler exists
			if ( ! $manager->has_handler( $components['sync_id'] ) ) {
				return '';
			}

			// Get button HTML from manager
			return $manager->get_button( $components['sync_id'], $args );

		} catch ( Exception $e ) {
			error_log( sprintf(
				'Batch Sync: Failed to get button for sync "%s" - %s',
				$id,
				$e->getMessage()
			) );

			return '';
		}
	}
}

if ( ! function_exists( 'batch_sync_button' ) ) {
	/**
	 * Render a batch sync trigger button
	 *
	 * Outputs the button HTML directly.
	 *
	 * @param string $id   Full sync identifier
	 * @param array  $args Button configuration to override defaults
	 *
	 * @return void
	 * @since 2.0.0
	 */
	function batch_sync_button( string $id, array $args = [] ): void {
		echo get_batch_sync_button( $id, $args );
	}
}

if ( ! function_exists( 'get_batch_sync_manager' ) ) {
	/**
	 * Get a manager instance directly
	 *
	 * Advanced function for direct access to a Manager instance.
	 * Useful when you need to perform multiple operations or access
	 * manager-specific methods not exposed through helper functions.
	 *
	 * @param string $prefix Manager prefix
	 *
	 * @return Manager|null Manager instance or null if error occurs
	 * @since 2.0.0
	 */
	function get_batch_sync_manager( string $prefix ): ?Manager {
		try {
			$registry = Registry::get_instance();

			return $registry->get_manager( $prefix );
		} catch ( Exception $e ) {
			error_log( sprintf(
				'Batch Sync: Failed to get manager for prefix "%s" - %s',
				$prefix,
				$e->getMessage()
			) );

			return null;
		}
	}
}