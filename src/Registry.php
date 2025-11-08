<?php
/**
 * Batch Sync Manager Registry
 *
 * Centralized registry for managing batch sync manager instances.
 * Implements a singleton pattern to ensure consistent access across the application.
 *
 * @package     ArrayPress\BatchSync
 * @copyright   Copyright (c) 2025, ArrayPress Limited
 * @license     GPL2+
 * @version     1.0.0
 * @since       2.0.0
 * @author      David Sherlock
 */

declare( strict_types=1 );

namespace ArrayPress\BatchSync;

use Exception;
use InvalidArgumentException;

/**
 * Class Registry
 *
 * Singleton registry for managing batch sync instances across the application.
 * Provides centralized access to Manager instances without using global variables.
 *
 * @since 2.0.0
 */
class Registry {

	/**
	 * Singleton instance
	 *
	 * @since 2.0.0
	 * @var self|null
	 */
	private static ?self $instance = null;

	/**
	 * Registered manager instances
	 *
	 * @since 2.0.0
	 * @var array<string, Manager> Associative array of prefix => Manager instance
	 */
	private array $managers = [];

	/**
	 * Private constructor
	 *
	 * Prevents direct instantiation to enforce singleton pattern.
	 *
	 * @since 2.0.0
	 */
	private function __construct() {
	}

	/**
	 * Prevent cloning
	 *
	 * Ensures singleton instance cannot be cloned.
	 *
	 * @return void
	 * @since 2.0.0
	 */
	private function __clone() {
	}

	/**
	 * Prevent unserialization
	 *
	 * Ensures singleton instance cannot be unserialized.
	 *
	 * @return void
	 * @throws Exception When attempting to unserialize
	 * @since 2.0.0
	 */
	public function __wakeup() {
		throw new Exception( "Cannot unserialize singleton" );
	}

	/**
	 * Get registry instance
	 *
	 * Returns the singleton instance of the registry, creating it if necessary.
	 *
	 * @return self Registry instance
	 * @since 2.0.0
	 */
	public static function get_instance(): self {
		if ( self::$instance === null ) {
			self::$instance = new self();
		}

		return self::$instance;
	}

	/**
	 * Parse sync identifier into components
	 *
	 * Splits a sync ID into its prefix and name components.
	 * Format: 'prefix_sync_name' becomes ['prefix', 'sync_name']
	 * Single word IDs get 'default' as the sync name.
	 *
	 * @param string $id Full sync identifier
	 *
	 * @return array{prefix: string, sync_id: string} Parsed components
	 * @since 2.0.0
	 */
	public static function parse_sync_id( string $id ): array {
		$parts = explode( '_', $id, 2 );

		if ( count( $parts ) === 1 ) {
			return [
				'prefix'  => $id,
				'sync_id' => 'default'
			];
		}

		return [
			'prefix'  => $parts[0],
			'sync_id' => $parts[1]
		];
	}

	/**
	 * Get or create a manager instance
	 *
	 * Retrieves an existing manager for the given prefix or creates a new one.
	 * Managers are created lazily on first access and cached for subsequent use.
	 *
	 * @param string $prefix Unique prefix for the manager namespace
	 *
	 * @return Manager Manager instance for the given prefix
	 * @since 2.0.0
	 */
	public function get_manager( string $prefix ): Manager {
		$prefix = sanitize_key( $prefix );

		if ( ! isset( $this->managers[ $prefix ] ) ) {
			$this->managers[ $prefix ] = new Manager( $prefix );
		}

		return $this->managers[ $prefix ];
	}

	/**
	 * Get a manager by full sync ID
	 *
	 * Convenience method that parses the sync ID and returns the appropriate manager.
	 *
	 * @param string $sync_id Full sync identifier (prefix_name format)
	 *
	 * @return Manager|null Manager instance or null if not found
	 * @since 2.0.0
	 */
	public function get_manager_by_sync_id( string $sync_id ): ?Manager {
		$components = self::parse_sync_id( $sync_id );

		if ( ! $this->has_manager( $components['prefix'] ) ) {
			return null;
		}

		return $this->get_manager( $components['prefix'] );
	}

	/**
	 * Register a manager instance
	 *
	 * Allows manual registration of a pre-configured manager instance.
	 * Useful for dependency injection or custom manager configurations.
	 *
	 * @param string  $prefix  Unique prefix for the manager namespace
	 * @param Manager $manager Pre-configured manager instance
	 *
	 * @return self Returns self for method chaining
	 * @throws InvalidArgumentException If prefix already registered
	 * @since 2.0.0
	 */
	public function register_manager( string $prefix, Manager $manager ): self {
		$prefix = sanitize_key( $prefix );

		if ( isset( $this->managers[ $prefix ] ) ) {
			throw new InvalidArgumentException(
				sprintf( 'Manager with prefix "%s" is already registered', $prefix )
			);
		}

		$this->managers[ $prefix ] = $manager;

		return $this;
	}

	/**
	 * Check if manager exists
	 *
	 * Determines whether a manager has been registered for the given prefix.
	 *
	 * @param string $prefix Manager prefix to check
	 *
	 * @return bool True if manager exists, false otherwise
	 * @since 2.0.0
	 */
	public function has_manager( string $prefix ): bool {
		$prefix = sanitize_key( $prefix );

		return isset( $this->managers[ $prefix ] );
	}

	/**
	 * Remove a manager
	 *
	 * Unregisters a manager from the registry. Useful for cleanup or testing.
	 *
	 * @param string $prefix Manager prefix to remove
	 *
	 * @return bool True if manager was removed, false if not found
	 * @since 2.0.0
	 */
	public function remove_manager( string $prefix ): bool {
		$prefix = sanitize_key( $prefix );

		if ( isset( $this->managers[ $prefix ] ) ) {
			unset( $this->managers[ $prefix ] );

			return true;
		}

		return false;
	}

	/**
	 * Get all registered managers
	 *
	 * Returns all currently registered manager instances.
	 * Useful for debugging or bulk operations.
	 *
	 * @return array<string, Manager> Array of prefix => Manager instance
	 * @since 2.0.0
	 */
	public function get_all_managers(): array {
		return $this->managers;
	}

	/**
	 * Get all registered prefixes
	 *
	 * Returns an array of all registered manager prefixes.
	 *
	 * @return string[] Array of registered prefixes
	 * @since 2.0.0
	 */
	public function get_prefixes(): array {
		return array_keys( $this->managers );
	}

	/**
	 * Count registered managers
	 *
	 * Returns the total number of registered managers.
	 *
	 * @return int Number of registered managers
	 * @since 2.0.0
	 */
	public function count(): int {
		return count( $this->managers );
	}

	/**
	 * Clear all managers
	 *
	 * Removes all registered managers from the registry.
	 * Primarily useful for testing or complete reinitialization.
	 *
	 * @return self Returns self for method chaining
	 * @since 2.0.0
	 */
	public function clear(): self {
		$this->managers = [];

		return $this;
	}

	/**
	 * Reset the singleton instance
	 *
	 * Clears the singleton instance, forcing creation of a new one on next access.
	 * Should only be used for testing purposes.
	 *
	 * @return void
	 * @internal
	 * @since 2.0.0
	 */
	public static function reset(): void {
		self::$instance = null;
	}

}