<script lang="ts">
	interface DataPoint {
		time: number;
		rxSpeed: number; // bytes/sec
		txSpeed: number; // bytes/sec
	}

	let {
		data = [],
		height = 60,
		colorRecv = '#10b981',
		colorSent = '#3b82f6'
	} = $props<{
		data: DataPoint[];
		height?: number;
		colorRecv?: string;
		colorSent?: string;
	}>();

	// Computed
	let points = $derived(data);
	let maxSpeed = $derived(
		Math.max(1024, ...points.map((p: DataPoint) => Math.max(p.rxSpeed, p.txSpeed))) * 1.1
	); // 10% headroom

	// Generate Path Data
	function getPath(type: 'rx' | 'tx'): string {
		if (points.length < 2) return '';

		const width = 100; // viewBox width percent
		const xStep = width / (points.length - 1);

		let d = `M 0,${height}`; // Start bottom-left

		points.forEach((p: DataPoint, i: number) => {
			const val = type === 'rx' ? p.rxSpeed : p.txSpeed;
			const x = i * xStep;
			const y = height - (val / maxSpeed) * height;

			if (i === 0) {
				d = `M ${x},${y}`;
			} else {
				// Simple line for now, could be bezier
				d += ` L ${x},${y}`;
			}
		});

		return d;
	}

	function getArea(type: 'rx' | 'tx'): string {
		const line = getPath(type);
		if (!line) return '';
		return `${line} L 100,${height} L 0,${height} Z`;
	}
</script>

<div class="graph-container" style="height: {height}px">
	<svg viewBox="0 0 100 {height}" preserveAspectRatio="none">
		<defs>
			<linearGradient id="gradRecv" x1="0%" y1="0%" x2="0%" y2="100%">
				<stop offset="0%" stop-color={colorRecv} stop-opacity="0.2" />
				<stop offset="100%" stop-color={colorRecv} stop-opacity="0" />
			</linearGradient>
			<linearGradient id="gradSent" x1="0%" y1="0%" x2="0%" y2="100%">
				<stop offset="0%" stop-color={colorSent} stop-opacity="0.2" />
				<stop offset="100%" stop-color={colorSent} stop-opacity="0" />
			</linearGradient>
		</defs>

		<!-- Rx Area & Line -->
		<path d={getArea('rx')} fill="url(#gradRecv)" />
		<path
			d={getPath('rx')}
			fill="none"
			stroke={colorRecv}
			stroke-width="1.5"
			vector-effect="non-scaling-stroke"
		/>

		<!-- Tx Area & Line -->
		<path d={getArea('tx')} fill="url(#gradSent)" />
		<path
			d={getPath('tx')}
			fill="none"
			stroke={colorSent}
			stroke-width="1.5"
			vector-effect="non-scaling-stroke"
		/>
	</svg>
</div>

<style>
	.graph-container {
		width: 100%;
		overflow: hidden;
		/* background: rgba(0,0,0,0.1); */
		border-radius: 4px;
	}
	svg {
		width: 100%;
		height: 100%;
		display: block;
	}
</style>
