<script setup>
import {
	computed, onMounted, onUnmounted, ref, watch
} from "vue";
import {
	wall, mediaUrl, getToken, sceneSources
} from "../api";
import { stackLayout, stackPictures } from "../../shared/stack-layout.js";
const imageDimensions = ref( new Map() );
const props = defineProps( { monitor: String, preview: Boolean } );
const root = ref(), size = ref( { width: 1200, height: 400 } ), now = ref( Date.now() );let observer, timer;
onMounted( () => {
	observer = new ResizeObserver( entries => {
		size.value = { width: entries[ 0 ].contentRect.width, height: entries[ 0 ].contentRect.height };
	} );observer.observe( root.value );timer = setInterval( () => now.value = Date.now(), 1000 );
} );onUnmounted( () => {
	observer?.disconnect();clearInterval( timer );
} );
const monitors = computed( () => wall.config?.monitors.filter( m => m.enabled ) || [] );
const bounds = computed( () => {
	const ms = monitors.value;

	if ( !ms.length ) {
		return {
			x: 0, y: 0, width: 1600, height: 900
		};
	}

	const x = Math.min( ...ms.map( m => m.x ) ), y = Math.min( ...ms.map( m => m.y ) );return {
		x, y, width: Math.max( ...ms.map( m => m.x + m.width ) ) - x, height: Math.max( ...ms.map( m => m.y + m.height ) ) - y
	};
} );
const target = computed( () => monitors.value.find( m => m.id === props.monitor ) || bounds.value );
const scale = computed( () => Math.min( size.value.width / target.value.width, size.value.height / target.value.height ) );
const worldStyle = computed( () => ( {
	width: `${bounds.value.width}px`, height: `${bounds.value.height}px`, left: `${( size.value.width - target.value.width * scale.value ) / 2}px`, top: `${( size.value.height - target.value.height * scale.value ) / 2}px`, transform: `scale(${scale.value}) translate(${bounds.value.x - target.value.x}px,${bounds.value.y - target.value.y}px)`, filter: `brightness(${wall.config?.brightness || 100}%)`, "--fade": `${wall.config?.fadeSeconds || 0}s`
} ) );
const scene = computed( () => wall.config?.scenes.find( s => s.id === wall.state.currentId ) );
const sources = computed( () => sceneSources( scene.value ) );
const elapsed = computed( () => Math.max( 0, ( ( wall.state.pausedAt || now.value ) - wall.state.changedAt ) / 1000 ) );
const imageStep = computed( () => Math.floor( elapsed.value / 12 ) );
const imageIndex = computed( () => sources.value.length ? imageStep.value % sources.value.length : 0 );

function monitorStyle( m ) {
	return {
		left: `${m.x - bounds.value.x}px`, top: `${m.y - bounds.value.y}px`, width: `${m.width}px`, height: `${m.height}px`
	};
}

function positionStyle( position ) {
	const [ top, horizontal ] = position.split( "-" );return {
		[ top === "top" ? "top" : "bottom" ]: "26px", [ horizontal === "right" ? "right" : "left" ]: horizontal === "center" ? "50%" : "30px", transform: horizontal === "center" ? "translateX(-50%)" : undefined, textAlign: horizontal
	};
}

function lines( w ) {
	if ( w.type === "clock" ) {
		return [ new Date( now.value ).toLocaleDateString( "de-DE", {
			weekday: "long", day: "numeric", month: "long"
		} ), new Date( now.value ).toLocaleTimeString( "de-DE", { hour: "2-digit", minute: "2-digit" } ) ];
	}

	if ( w.type === "title" ) {
		return [ scene.value?.title || "Keine aktive Szene" ];
	}

	return wall.widgets[ w.id ]?.lines || [];
}

const stacks = computed( () => monitors.value.map( ( monitor, monitorIndex ) => {
	const pictures = stackPictures(
		sources.value, imageStep.value, monitorIndex
	);
	const cards = stackLayout(
		monitor, monitorIndex, pictures.map( source => imageDimensions.value.get( source ) ), imageStep.value
	);
	return {
		monitor,
		cards: cards.map( ( card, index ) => ( {
			...card, source: pictures[ index ], loaded: imageDimensions.value.has( pictures[ index ] )
		} ) )
	};
} ) );

watch( () => sources.value.join( "\n" ), () => {
	const active = new Set( sources.value );

	for ( const source of imageDimensions.value.keys() ) {
		if ( !active.has( source ) ) {
			imageDimensions.value.delete( source );
		}
	}
} );

function rememberImage( source, event ) {
	const image = event.target;

	if ( image.naturalWidth && image.naturalHeight ) {
		imageDimensions.value.set( source, { width: image.naturalWidth, height: image.naturalHeight } );
	}
}

function stackStyle( card ) {
	return {
		left:        `${card.x}px`,
		top:         `${card.y}px`,
		width:       `${card.width}px`,
		height:      `${card.height}px`,
		borderWidth: `${card.border}px`,
		opacity:     card.loaded ? 1 : 0,
		transform:   `translate(-50%,-50%) rotate(${card.rotation}deg)`,
		zIndex:      card.zIndex
	};
}

</script>
<template>
<div ref="root"
	aria-label="Vorschau der Bilderwand"
	class="wall-canvas"
	:class="{ preview }"
>
	<div class="wall-world" :style="worldStyle">
		<Transition name="scene"><div v-if="scene" :key="scene.id" class="scene-layer">
			<div v-if="scene.type==='panorama'" class="panorama" :style="{ backgroundImage:`url('${mediaUrl(sources[imageIndex])}')`,backgroundPosition:`center ${50-50*Math.cos(elapsed/scene.scrollSeconds*Math.PI*2)}%` }"></div>
			<iframe v-else-if="scene.type==='html'"
				class="html-scene"
				referrerpolicy="no-referrer"
				sandbox="allow-scripts"
				:src="mediaUrl(sources[0])"
				title="Hinterlegte HTML-Seite"
			></iframe>
			<div v-else-if="scene.type==='fit'" class="fit-scene"><img alt="" :src="mediaUrl(sources[imageIndex])" /></div>
			<template v-else-if="[ 'stack','google-photos','google-picker' ].includes(scene.type)&&sources.length"><div v-for="stack in stacks"
				:key="stack.monitor.id"
				class="stack-monitor"
				:style="monitorStyle(stack.monitor)"
			><img v-for="card in stack.cards"
				:key="card.zIndex"
				alt=""
				:src="mediaUrl(card.source)"
				:style="stackStyle(card)"
				@load="rememberImage(card.source,$event)"
			/></div></template>
		</div></Transition>
		<div v-if="!scene" class="empty-wall">Keine Szene für diese Tageszeit. Medien hinzufügen oder Filter anpassen.</div>
		<div v-for="m in monitors"
			:key="m.id"
			class="monitor-overlay"
			:style="monitorStyle(m)"
		>
			<div v-for="position in [ 'top-left','top-center','top-right','bottom-left','bottom-center','bottom-right' ]"
				:key="position"
				class="overlay-group"
				:style="positionStyle(position)"
			>
				<section v-for="w in wall.config.widgets.filter(w=>w.enabled&&w.monitor===m.id&&w.position===position)"
					:key="w.id"
					class="info-widget"
					:class="[ w.type ]"
				>
					<div v-if="![ 'clock','title' ].includes(w.type)" class="widget-heading">{{w.title}}</div>
					<template v-if="w.type==='cameras'"><div class="camera-grid"><figure v-for="c in wall.widgets[w.id]?.cameras||[]" :key="c.index"><img :alt="c.name" :src="`/api/camera/${w.id}/${c.index}?token=${getToken()}&t=${wall.widgets[w.id]?.updatedAt||0}`"><figcaption>{{c.name}}</figcaption></figure></div></template>
					<div v-for="(line,i) in lines(w)" :key="i" class="widget-line">{{line}}</div>
					<div v-if="wall.widgets[w.id]?.status==='error'" class="widget-error">{{wall.widgets[w.id].error}}</div>
					<div v-else-if="![ 'clock','title','cameras' ].includes(w.type)&&!lines(w).length" class="widget-muted">{{wall.widgets[w.id]?'Keine Einträge':'Wird geladen …'}}</div>
				</section>
			</div>
			<div v-if="preview" class="monitor-marker">{{m.name}}</div>
		</div>
	</div>
</div>
</template>
