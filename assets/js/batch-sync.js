/**
 * Batch Sync - Modal JavaScript
 *
 * @package ArrayPress\BatchSync
 * @version 1.0.0
 */

(function ($) {
    'use strict';

    /**
     * Batch Sync Client
     */
    class BatchSyncClient {
        constructor(config) {
            this.config = {
                ajaxUrl: '',
                nonce: '',
                prefix: '',
                syncId: '',
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
        }

        async syncAll() {
            let startingAfter = '';
            let hasMore = true;
            let totalProcessed = 0;
            let totalFailed = 0;
            let estimatedTotal = 0;
            let batchNum = 0;

            this.aborted = false;

            while (hasMore && !this.aborted) {
                try {
                    batchNum++;
                    const response = await this.syncBatch(startingAfter, this.config.options);

                    totalProcessed += response.processed;
                    totalFailed += response.failed;
                    hasMore = response.has_more;
                    startingAfter = response.last_id || '';

                    // Set estimated total from first response
                    if (batchNum === 1 && response.estimated_total) {
                        estimatedTotal = response.estimated_total;
                    }

                    if (this.config.onProgress) {
                        this.config.onProgress({
                            processed: totalProcessed,
                            failed: totalFailed,
                            total: totalProcessed,
                            estimatedTotal: estimatedTotal,
                            hasMore: hasMore,
                            batchNum: batchNum
                        });
                    }

                    if (this.config.onBatchComplete && response.items) {
                        await this.config.onBatchComplete(response.items);
                    }

                } catch (error) {
                    if (this.config.onError) {
                        this.config.onError(error);
                    }
                    break;
                }
            }

            const finalStats = {
                processed: totalProcessed,
                failed: totalFailed,
                total: totalProcessed + totalFailed, // Total = successful + failed
                aborted: this.aborted
            };

            if (this.config.onComplete) {
                this.config.onComplete(finalStats);
            }

            return finalStats;
        }

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
                throw new Error(response.data?.message || 'Sync failed');
            }

            return response.data;
        }

        abort() {
            this.aborted = true;
        }
    }

    /**
     * Modal Manager
     */
    const ModalManager = {
        init() {
            this.bindButtons();
        },

        bindButtons() {
            $(document).on('click', '.batch-sync-trigger', (e) => {
                e.preventDefault();
                const $button = $(e.currentTarget);
                this.openModal($button);
            });

            $(document).on('click', '.batch-sync-modal-close, .batch-sync-modal-close-x', (e) => {
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
                this.startSync($modal);
            });
        },

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

            $modal.data('sync-config', {
                prefix: prefix,
                syncId: syncId,
                nonce: nonce
            });

            this.resetModal($modal);
            $modal.fadeIn(200);
            $('body').addClass('batch-sync-modal-open');
        },

        closeModal($modal) {
            const $startButton = $modal.find('.batch-sync-start');

            if ($startButton.prop('disabled')) {
                const config = window.batchSyncConfig || {};
                if (!confirm(config.strings?.confirmCancel || 'Cancel sync?')) {
                    return;
                }

                const client = $modal.data('syncClient');
                if (client) {
                    client.abort();
                }
            }

            $modal.fadeOut(200);
            $('body').removeClass('batch-sync-modal-open');
        },

        resetModal($modal) {
            $modal.find('.batch-sync-percentage').text('0%');
            $modal.find('.batch-sync-current').text('0');
            $modal.find('.batch-sync-total').text('0');
            $modal.find('.batch-sync-progress-fill').css('width', '0%');
            $modal.find('.batch-sync-status').empty();
            $modal.find('.batch-sync-log-entries').empty();
            $modal.find('.batch-sync-log').removeClass('has-entries');
            $modal.find('.batch-sync-start').prop('disabled', false);
            $modal.find('.batch-sync-start .dashicons').removeClass('batch-sync-spin');
        },

        async startSync($modal) {
            const syncConfig = $modal.data('sync-config');
            const config = window.batchSyncConfig || {};
            const handlerConfig = config.handlers?.[syncConfig.syncId] || {};
            const strings = config.strings || {};

            const $startButton = $modal.find('.batch-sync-start');
            const $percentage = $modal.find('.batch-sync-percentage');
            const $current = $modal.find('.batch-sync-current');
            const $total = $modal.find('.batch-sync-total');
            const $progress = $modal.find('.batch-sync-progress-fill');
            const $status = $modal.find('.batch-sync-status');
            const $log = $modal.find('.batch-sync-log-entries');

            $startButton.prop('disabled', true);
            const originalIcon = handlerConfig.icon || 'update';
            $startButton.find('.dashicons')
                .removeClass('dashicons-' + originalIcon)
                .addClass('dashicons-update-alt batch-sync-spin');

            const client = new BatchSyncClient({
                ajaxUrl: config.ajaxUrl,
                prefix: syncConfig.prefix,
                syncId: syncConfig.syncId,
                nonce: syncConfig.nonce,
                limit: handlerConfig.limit || 10,
                singular: handlerConfig.singular || 'item',
                plural: handlerConfig.plural || 'items',

                onProgress(stats) {
                    const percent = stats.estimatedTotal > 0
                        ? Math.min(95, Math.round((stats.total / stats.estimatedTotal) * 100))
                        : 0;

                    $progress.css('width', percent + '%');
                    $percentage.text(percent + '%');
                    $current.text(stats.total);
                    $total.text(stats.estimatedTotal);
                },

                async onBatchComplete(items) {
                    for (let i = 0; i < items.length; i++) {
                        const item = items[i];
                        const itemName = item.name || item.id || 'Item';
                        const hasError = item.error && item.error !== null;

                        $status.text((hasError ? strings.error : strings.processing) + ' ' + itemName);
                        addLogEntry($log, itemName, hasError ? 'error' : 'success', item.error);

                        await new Promise(resolve => setTimeout(resolve, 50));
                    }
                },

                onComplete(stats) {
                    $progress.css('width', '100%');
                    $percentage.text('100%');
                    $current.text(stats.total);
                    $total.text(stats.total);

                    const itemName = stats.processed === 1 ? handlerConfig.singular : handlerConfig.plural;
                    let message;

                    if (stats.aborted) {
                        message = strings.error + ' Sync cancelled.';
                        $status.html(`<span class="batch-sync-error">${message}</span>`);
                    } else if (stats.failed === 0) {
                        message = `${strings.complete} ${stats.processed} ${itemName} ${strings.synced}.`;
                        $status.html(`<span class="batch-sync-success">${message}</span>`);
                    } else {
                        message = `${strings.complete} ${stats.processed} ${itemName} ${strings.synced}, ${stats.failed} ${strings.failed}.`;
                        $status.html(`<span class="batch-sync-warning">${message}</span>`);
                    }

                    addLogEntry($log, message, stats.failed > 0 ? 'warning' : 'success');

                    $startButton.prop('disabled', false);
                    $startButton.find('.dashicons')
                        .removeClass('dashicons-update-alt batch-sync-spin')
                        .addClass('dashicons-' + originalIcon);

                    // Auto-close if configured
                    if (handlerConfig.autoClose && !stats.aborted && stats.failed === 0) {
                        if (handlerConfig.noticeTarget) {
                            showNotice(handlerConfig.noticeTarget, message, 'success');
                        }

                        setTimeout(() => {
                            ModalManager.closeModal($modal);
                            setTimeout(() => {
                                window.location.reload();
                            }, 1500);
                        }, 1000);
                    }
                },

                onError(error) {
                    $status.html(`<span class="batch-sync-error">${strings.error} ${error.message}</span>`);
                    addLogEntry($log, error.message, 'error');
                    $log.closest('.batch-sync-log').addClass('has-entries');

                    $startButton.prop('disabled', false);
                    $startButton.find('.dashicons')
                        .removeClass('dashicons-update-alt batch-sync-spin')
                        .addClass('dashicons-' + originalIcon);
                }
            });

            $modal.data('syncClient', client);
            await client.syncAll();
        }
    };

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
        $log.closest('.batch-sync-log').addClass('has-entries');

        const entries = $log.find('.batch-sync-log-entry');
        if (entries.length > 100) {
            entries.slice(0, entries.length - 100).remove();
        }
    }

    function showNotice(target, message, type = 'success') {
        const noticeClass = type === 'error' ? 'notice-error' :
            type === 'warning' ? 'notice-warning' :
                'notice-success';

        const $notice = $(`
            <div class="notice ${noticeClass} is-dismissible">
                <p>${message}</p>
            </div>
        `);

        const $target = $(target);
        if ($target.length) {
            $target.after($notice);
        } else {
            $('.wrap h1').first().after($notice);
        }

        $notice.on('click', '.notice-dismiss', function () {
            $notice.fadeOut(() => $notice.remove());
        });

        setTimeout(() => {
            $notice.fadeOut(() => $notice.remove());
        }, 5000);
    }

    $(document).ready(() => {
        ModalManager.init();
    });

    window.BatchSyncClient = BatchSyncClient;

})(jQuery);