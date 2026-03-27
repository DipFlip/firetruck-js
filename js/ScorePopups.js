import * as THREE from 'three';

const POPUP_POOL_SIZE = 24;
const _popupDrift = new THREE.Vector3();

function createTextTexture( text ) {

	const canvas = document.createElement( 'canvas' );
	canvas.width = 256;
	canvas.height = 128;

	const ctx = canvas.getContext( '2d' );
	ctx.clearRect( 0, 0, canvas.width, canvas.height );
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.font = 'bold 76px Arial';
	ctx.lineWidth = 12;
	ctx.strokeStyle = 'rgba(28, 32, 40, 0.65)';
	ctx.strokeText( text, canvas.width / 2, canvas.height / 2 );
	ctx.fillStyle = '#ffd466';
	ctx.fillText( text, canvas.width / 2, canvas.height / 2 );

	const texture = new THREE.CanvasTexture( canvas );
	texture.needsUpdate = true;
	return texture;

}

export class ScorePopupSystem {

	constructor( scene ) {

		this.popups = [];
		this.emitIndex = 0;
		this.texture = createTextTexture( '+10' );

		for ( let i = 0; i < POPUP_POOL_SIZE; i ++ ) {

			const sprite = new THREE.Sprite( new THREE.SpriteMaterial( {
				map: this.texture,
				transparent: true,
				depthWrite: false,
				depthTest: false,
				opacity: 0,
				color: 0xffffff,
			} ) );
			sprite.visible = false;
			sprite.scale.set( 2.2, 1.1, 1 );
			scene.add( sprite );

			this.popups.push( {
				sprite,
				life: 0,
				maxLife: 0,
				velocity: new THREE.Vector3(),
				startOpacity: 1,
				endOpacity: 0,
			} );

		}

	}

	spawn( worldPosition ) {

		const popup = this.popups[ this.emitIndex ];
		this.emitIndex = ( this.emitIndex + 1 ) % this.popups.length;

		_popupDrift.set(
			( Math.random() - 0.5 ) * 0.18,
			1.15 + Math.random() * 0.2,
			( Math.random() - 0.5 ) * 0.18
		);

		popup.sprite.position.copy( worldPosition );
		popup.sprite.position.y += 0.65;
		popup.sprite.visible = true;
		popup.sprite.material.opacity = popup.startOpacity;
		popup.sprite.scale.set( 2.2, 1.1, 1 );
		popup.velocity.copy( _popupDrift );
		popup.maxLife = 0.9;
		popup.life = popup.maxLife;

	}

	update( dt ) {

		for ( const popup of this.popups ) {

			if ( popup.life <= 0 ) continue;

			popup.life -= dt;

			if ( popup.life <= 0 ) {

				popup.sprite.visible = false;
				continue;

			}

			const t = 1 - popup.life / popup.maxLife;
			const width = THREE.MathUtils.lerp( 2.2, 2.8, t );
			popup.sprite.position.addScaledVector( popup.velocity, dt );
			popup.sprite.scale.set( width, width * 0.5, 1 );
			popup.sprite.material.opacity = THREE.MathUtils.lerp( popup.startOpacity, popup.endOpacity, t );

		}

	}

}
