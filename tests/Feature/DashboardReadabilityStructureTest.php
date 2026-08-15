<?php

namespace Tests\Feature;

use Tests\TestCase;

class DashboardReadabilityStructureTest extends TestCase
{
    public function test_manager_pages_share_one_readability_layer(): void
    {
        foreach ($this->managerPages() as $page => $excludedTabs) {
            $html = file_get_contents(public_path("dashboard/{$page}.html"));

            $this->assertStringContainsString(
                'assets/css/dashboard-readable.css',
                $html,
                "{$page} must load the shared readability layer",
            );

            preg_match_all(
                '/<div id="tab-([^"]+)" class="([^"]*section-content[^"]*)">/',
                $html,
                $matches,
                PREG_SET_ORDER,
            );

            $this->assertNotEmpty($matches, "{$page} must expose dashboard sections");

            foreach ($matches as $match) {
                $tab = $match[1];
                $classes = preg_split('/\s+/', trim($match[2]));
                $shouldRemainUntouched = in_array($tab, $excludedTabs, true);

                $this->assertSame(
                    ! $shouldRemainUntouched,
                    in_array('readable-section', $classes, true),
                    "Unexpected readability scope for {$page}#tab-{$tab}",
                );
            }
        }
    }

    public function test_shared_layer_does_not_target_individually_redesigned_orders_or_reports(): void
    {
        $css = file_get_contents(public_path('dashboard/assets/css/dashboard-readable.css'));

        $this->assertStringNotContainsString('.gm-order-card', $css);
        $this->assertStringNotContainsString('.gm-orders-grid', $css);
        $this->assertStringNotContainsString('.report-card', $css);
        $this->assertStringNotContainsString('.orders-workspace .order-card', $css);
    }

    private function managerPages(): array
    {
        return [
            'general-manager' => ['orders', 'reports'],
            'order-manager' => ['orders'],
            'inventory-manager' => [],
            'finance-manager' => [],
            'delivery-manager' => [],
            'communication-manager' => [],
        ];
    }
}
