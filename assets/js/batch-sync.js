/**
 * Batch Sync - Modal JavaScript
 *
 * Handles batch synchronization with modal UI.
 *
 * @package ArrayPress\BatchSync
 * @version 1.0.0
 * @requires jQuery
 */

(function ($) {
    'use strict';

    /**
     * Batch Sync Client
     */
    class BatchSyncClient {
        /**
         * Constructor
         *
         * @param {Object} config Configuration
         */
        constructor(config) {
            this.config = {
                ajaxUrl: window.ajaxurl || '',
                prefix: '',
                syncId: '',
                nonce: '',
                limit: 10,
                singular: 'item',
                plural: 'items',
                options: {},
                onProgress: null,
                onComplete: null,
                onError: null,
                onBatchComplete: null,
                ...config
            };

            this.aborted = false;
            this.totalProcessed = 0;
            this.totalFailed = 0;
        }

        /**
         * Sync all items in batches
         */
        async syncAll(options = {}) {
            let startingAfter = '';
            let hasMore = true;
            let batchNum = 0;
            let estimatedTotal = 0;

            this.aborted = false;
            this.totalProcessed = 0;
            this.totalFailed = 0;

            while (hasMore && !this.aborted) {
                try {
                    batchNum++;
                    const response = await this.syncBatch(startingAfter, options);

                    // Update estimated total
                    if (response.has_more) {
                        estimatedTotal = Math.max(estimatedTotal, this.totalProcessed + response.processed + 50);
                    } else {
                        estimatedTotal = this.totalProcessed + response.processed;
                    }

                    // Process items
                    if (response.items && response.items.length > 0) {
                        if (this.config.onBatchComplete) {
                            await this.config.onBatchComplete(response.items, batchNum);
                        }
                    }

                    this.totalProcessed += response.processed || 0;
                    this.totalFailed += response.failed || 0;

                    hasMore = response.has_more;
                    startingAfter = response.last_id;

                    // Progress callback
                    if (this.config.onProgress) {
                        this.config.onProgress({
                            processed: this.totalProcessed,
                            failed: this.totalFailed,
                            total: this.totalProcessed + this.totalFailed,
                            estimatedTotal: estimatedTotal,
                            hasMore: hasMore,
                            batchNum: batchNum,
                            currentBatch: response.items || []
                        });
                    }

                } catch (error) {
                    if (this.config.onError) {
                        this.config.onError(error);
                    }
                    break;
                }
            }

            const finalStats = {
                processed: this.totalProcessed,
                failed: this.totalFailed,
                total: this.totalProcessed + this.totalFailed,
                batches: batchNum,
                aborted: this.aborted
            };

            if (this.config.onComplete) {
                this.config.onComplete(finalStats);
            }

            return finalStats;
        }

        /**
         * Sync a single batch
         */
        async syncBatch(startingAfter = '', options = {}) {
            const mergedOptions = {...this.config.options, ...options};

            const response = await $.ajax({
                url: this.config.ajaxUrl,
                type: 'POST',
                data: {
                    action: `batch_sync_${this.config.prefix}`,
                    _wpnonce: this.config.nonce,
                    sync_id: this.config.syncId,
                    starting_after: startingAfter,
                    limit: this.config.limit,
                    options: JSON.stringify(mergedOptions)
                }
            });

            if (!response.success) {
                throw new Error(response.data || 'Sync failed');
            }

            return response.data;
        }

        /**
         * Abort sync
         */
        abort() {
            this.aborted = true;
        }

        /**
         * Check if aborted
         */
        isAborted() {
            return this.aborted;
        }
    }

    /**
     * Modal Manager
     */
    const ModalManager = {
        /**
         * Initialize all buttons
         */
        init() {
            this.bindButtons();
        },

        /**
         * Bind click handlers to buttons
         */
        bindButtons() {
            $(document).on('click', '.batch-sync-trigger', (e) => {
                e.preventDefault();
                const $button = $(e.currentTarget);
                this.openModal($button);
            });

            $(document).on('click', '.batch-sync-modal-close', (e) => {
                e.preventDefault();
                this.closeModal($(e.currentTarget).closest('.batch-sync-modal'));
            });

            $(document).on('click', '.batch-sync-modal-backdrop', (e) => {
                this.closeModal($(e.currentTarget).closest('.batch-sync-modal'));
            });

            $(document).on('click', '.batch-sync-start', (e) => {
                e.preventDefault();
                const $button = $(e.currentTarget);
                const $modal = $button.closest('.batch-sync-modal');
                this.startSync($modal, false);
            });

            $(document).on('click', '.batch-sync-dry-run', (e) => {
                e.preventDefault();
                const $button = $(e.currentTarget);
                const $modal = $button.closest('.batch-sync-modal');
                this.startSync($modal, true);
            });

            $(document).on('click', '.batch-sync-copy-log', (e) => {
                e.preventDefault();
                const $button = $(e.currentTarget);
                const $modal = $button.closest('.batch-sync-modal');
                this.copyLog($modal);
            });

            $(document).on('click', '.batch-sync-run-again', (e) => {
                e.preventDefault();
                const $button = $(e.currentTarget);
                const $modal = $button.closest('.batch-sync-modal');
                this.runAgain($modal);
            });
        },

        /**
         * Open modal
         */
        openModal($button) {
            const prefix = $button.data('sync-prefix');
            const syncId = $button.data('sync-id');
            const nonce = $button.data('sync-nonce');

            const modalId = `#batch-sync-modal-${prefix}-${syncId}`;
            const $modal = $(modalId);

            if (!$modal.length) {
                console.error('Modal not found:', modalId);
                return;
            }

            // Store config on modal
            $modal.data('sync-config', {
                prefix: prefix,
                syncId: syncId,
                nonce: nonce
            });

            // Reset modal state
            this.resetModal($modal);

            // Show modal
            $modal.fadeIn(200);
            $('body').addClass('batch-sync-modal-open');
        },

        /**
         * Close modal
         */
        closeModal($modal) {
            const $startButton = $modal.find('.batch-sync-start');

            // Check if sync is running
            if ($startButton.prop('disabled')) {
                const config = window.batchSyncConfig || {};
                if (!confirm(config.strings?.confirmCancel || 'Cancel sync?')) {
                    return;
                }

                // Abort sync
                const client = $modal.data('syncClient');
                if (client) {
                    client.abort();
                }
            }

            $modal.fadeOut(200);
            $('body').removeClass('batch-sync-modal-open');
        },

        /**
         * Reset modal state
         */
        resetModal($modal) {
            $modal.find('.batch-sync-percentage').text('0%');
            $modal.find('.batch-sync-current').text('0');
            $modal.find('.batch-sync-total').text('0');
            $modal.find('.batch-sync-time-remaining').text('--');
            $modal.find('.batch-sync-progress-fill').css('width', '0%');
            $modal.find('.batch-sync-status').empty();
            $modal.find('.batch-sync-log-entries').empty();
            $modal.find('.batch-sync-log').removeClass('has-entries');
            $modal.find('.batch-sync-start').prop('disabled', false).show();
            $modal.find('.batch-sync-start .dashicons').removeClass('batch-sync-spin');
            $modal.find('.batch-sync-dry-run').prop('disabled', false).show();
            $modal.find('.batch-sync-copy-log').hide();
            $modal.find('.batch-sync-run-again').hide();
            $modal.find('.batch-sync-dry-run-banner').remove();
        },

        /**
         * Copy log to clipboard
         */
        copyLog($modal) {
            const $entries = $modal.find('.batch-sync-log-entry');
            const config = window.batchSyncConfig || {};
            const strings = config.strings || {};

            let logText = '';
            $entries.each(function() {
                const time = $(this).find('.batch-sync-log-time').text();
                const message = $(this).find('.batch-sync-log-message').text();
                logText += `${time} ${message}\n`;
            });

            if (logText) {
                navigator.clipboard.writeText(logText).then(() => {
                    // Show temporary success message
                    const $button = $modal.find('.batch-sync-copy-log');
                    const originalText = $button.html();
                    $button.html('<span class="dashicons dashicons-yes"></span> ' + strings.logCopied);
                    setTimeout(() => {
                        $button.html(originalText);
                    }, 2000);
                });
            }
        },

        /**
         * Run sync again
         */
        runAgain($modal) {
            this.resetModal($modal);
            this.startSync($modal, false);
        },

        /**
         * Start sync
         */
        async startSync($modal, dryRun = false) {
            const syncConfig = $modal.data('sync-config');
            const config = window.batchSyncConfig || {};
            const handlerConfig = config.handlers?.[syncConfig.syncId] || {};
            const strings = config.strings || {};

            const $startButton = $modal.find('.batch-sync-start');
            const $dryRunButton = $modal.find('.batch-sync-dry-run');
            const $percentage = $modal.find('.batch-sync-percentage');
            const $current = $modal.find('.batch-sync-current');
            const $total = $modal.find('.batch-sync-total');
            const $timeRemaining = $modal.find('.batch-sync-time-remaining');
            const $progress = $modal.find('.batch-sync-progress-fill');
            const $status = $modal.find('.batch-sync-status');
            const $log = $modal.find('.batch-sync-log-entries');

            // Time tracking
            let startTime = Date.now();
            let batchCount = 0;

            // Show dry run banner if in dry run mode
            if (dryRun) {
                const $banner = $(`
                    <div class="batch-sync-dry-run-banner">
                        <span class="dashicons dashicons-visibility"></span>
                        <strong>${strings.dryRunMode}</strong>
                    </div>
                `);
                $modal.find('.batch-sync-modal-body').prepend($banner);
            }

            // Disable buttons and change icon
            $startButton.prop('disabled', true);
            $dryRunButton.prop('disabled', true).hide();
            $startButton.find('.dashicons')
                .removeClass('dashicons-' + handlerConfig.icon)
                .addClass('dashicons-update-alt batch-sync-spin');

            // Helper function to update time remaining
            const updateTimeRemaining = (currentTotal, estimatedTotal) => {
                if (currentTotal > 0 && estimatedTotal > 0 && currentTotal < estimatedTotal) {
                    const elapsed = (Date.now() - startTime) / 1000; // seconds
                    const rate = currentTotal / elapsed; // items per second
                    const remaining = estimatedTotal - currentTotal;
                    const estimatedSeconds = remaining / rate;

                    if (estimatedSeconds > 0 && estimatedSeconds < 3600) { // Less than 1 hour
                        const minutes = Math.floor(estimatedSeconds / 60);
                        const seconds = Math.floor(estimatedSeconds % 60);
                        if (minutes > 0) {
                            $timeRemaining.text(`~${minutes}m ${seconds}s`);
                        } else {
                            $timeRemaining.text(`~${seconds}s`);
                        }
                    } else if (estimatedSeconds >= 3600) {
                        $timeRemaining.text('~' + Math.floor(estimatedSeconds / 3600) + 'h');
                    } else {
                        $timeRemaining.text('--');
                    }
                } else {
                    $timeRemaining.text('--');
                }
            };

            // Create sync client
            const client = new BatchSyncClient({
                ajaxUrl: config.ajaxUrl,
                prefix: syncConfig.prefix,
                syncId: syncConfig.syncId,
                nonce: syncConfig.nonce,
                limit: handlerConfig.limit || 10,
                singular: handlerConfig.singular || 'item',
                plural: handlerConfig.plural || 'items',
                options: { dry_run: dryRun }, // Pass dry run flag

                onProgress(stats) {
                    // Update progress
                    const percent = stats.estimatedTotal > 0
                        ? Math.min(95, Math.round((stats.total / stats.estimatedTotal) * 100))
                        : 0;

                    $progress.css('width', percent + '%');
                    $percentage.text(percent + '%');
                    $current.text(stats.total);
                    $total.text(stats.estimatedTotal);

                    // Update estimated time remaining
                    updateTimeRemaining(stats.total, stats.estimatedTotal);
                    batchCount = stats.batchNum || 0;
                },

                async onBatchComplete(items) {
                    // Animate each item
                    for (let i = 0; i < items.length; i++) {
                        const item = items[i];
                        const itemName = item.name || item.id || 'Item';
                        const hasError = item.error && item.error !== null;

                        // Update status
                        $status.text((hasError ? strings.error : strings.processing) + ' ' + itemName);

                        // Add log entry
                        addLogEntry($log, itemName, hasError ? 'error' : 'success', item.error);

                        // Small delay for animation
                        await new Promise(resolve => setTimeout(resolve, 50));
                    }
                },

                onComplete(stats) {
                    // Final progress
                    $progress.css('width', '100%');
                    $percentage.text('100%');
                    $current.text(stats.total);
                    $total.text(stats.total);
                    $timeRemaining.text('Complete');

                    // Status message
                    const itemName = stats.processed === 1 ? handlerConfig.singular : handlerConfig.plural;
                    let message;
                    let noticeType = 'success';

                    if (stats.aborted) {
                        message = strings.error + ' Sync cancelled.';
                        noticeType = 'error';
                        $status.html(`<span class="batch-sync-error">${message}</span>`);
                    } else if (stats.failed === 0) {
                        message = `${strings.complete} ${stats.processed} ${itemName} ${strings.synced}.`;
                        $status.html(`<span class="batch-sync-success">${message}</span>`);
                    } else {
                        message = `${strings.complete} ${stats.processed} ${itemName} ${strings.synced}, ${stats.failed} ${strings.failed}.`;
                        noticeType = 'warning';
                        $status.html(`<span class="batch-sync-warning">${message}</span>`);
                    }

                    // Add final log entry
                    addLogEntry($log, message, stats.failed > 0 ? 'warning' : 'success');

                    // Re-enable start button and restore icon, but hide it
                    $startButton.prop('disabled', false).hide();
                    $startButton.find('.dashicons')
                        .removeClass('dashicons-update-alt batch-sync-spin')
                        .addClass('dashicons-' + handlerConfig.icon);

                    // Hide dry run button as well
                    $dryRunButton.hide();

                    // Show Copy Log and Run Again buttons after completion
                    $modal.find('.batch-sync-copy-log').show();
                    $modal.find('.batch-sync-run-again').show();

                    // Auto-close modal and show notice if configured (but not in dry run mode)
                    if (!dryRun && handlerConfig.autoClose && !stats.aborted && stats.failed === 0) {
                        // Show notice
                        if (handlerConfig.noticeTarget) {
                            showNotice(handlerConfig.noticeTarget, message, noticeType);
                        }

                        // Close modal after short delay
                        setTimeout(() => {
                            ModalManager.closeModal($modal);

                            // Refresh page after another short delay to show the notice first
                            setTimeout(() => {
                                window.location.reload();
                            }, 1500);
                        }, 1000);
                    }
                },

                onError(error) {
                    $status.html(`<span class="batch-sync-error">${strings.error} ${error.message}</span>`);
                    addLogEntry($log, error.message, 'error');

                    // Keep log visible on error
                    $log.addClass('has-entries');

                    $startButton.prop('disabled', false).hide();
                    $startButton.find('.dashicons')
                        .removeClass('dashicons-update-alt batch-sync-spin')
                        .addClass('dashicons-' + handlerConfig.icon);

                    // Hide dry run button as well
                    $dryRunButton.hide();

                    // Show Copy Log and Run Again buttons on error
                    $modal.find('.batch-sync-copy-log').show();
                    $modal.find('.batch-sync-run-again').show();
                }
            });

            // Store client on modal
            $modal.data('syncClient', client);

            // Start sync
            await client.syncAll();
        }
    };

    /**
     * Add log entry
     */
    function addLogEntry($log, message, status = 'info', errorDetail = null) {
        const timestamp = new Date().toLocaleTimeString();
        const icons = {
            'success': '✓',
            'error': '✗',
            'info': 'ℹ',
            'warning': '⚠'
        };

        let fullMessage = message;
        if (errorDetail) {
            fullMessage += ' - ' + errorDetail;
        }

        const $entry = $(`
            <div class="batch-sync-log-entry batch-sync-log-${status}">
                <span class="batch-sync-log-time">${timestamp}</span>
                <span class="batch-sync-log-icon">${icons[status] || 'ℹ'}</span>
                <span class="batch-sync-log-message">${fullMessage}</span>
            </div>
        `);

        $log.append($entry);
        $log.scrollTop($log[0].scrollHeight);

        // Show log container when first entry is added
        $log.closest('.batch-sync-log').addClass('has-entries');

        // Limit entries
        const entries = $log.find('.batch-sync-log-entry');
        if (entries.length > 100) {
            entries.slice(0, entries.length - 100).remove();
        }
    }

    /**
     * Show WordPress admin notice
     */
    function showNotice(target, message, type = 'success') {
        const noticeClass = type === 'error' ? 'notice-error' :
            type === 'warning' ? 'notice-warning' :
                'notice-success';

        const $notice = $(`
            <div class="notice ${noticeClass} is-dismissible">
                <p>${message}</p>
            </div>
        `);

        // Insert notice
        const $target = $(target);
        if ($target.length) {
            $target.after($notice);
        } else {
            $('.wrap h1').first().after($notice);
        }

        // Make dismissible work
        $notice.on('click', '.notice-dismiss', function() {
            $notice.fadeOut(() => $notice.remove());
        });

        // Auto-dismiss after 5 seconds
        setTimeout(() => {
            $notice.fadeOut(() => $notice.remove());
        }, 5000);
    }

    // Initialize on ready
    $(function () {
        ModalManager.init();
    });

    // Export
    window.BatchSyncClient = BatchSyncClient;
    window.BatchSyncModal = ModalManager;

})(jQuery);