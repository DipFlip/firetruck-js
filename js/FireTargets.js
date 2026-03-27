import * as THREE from 'three';

const FIRE_DAMAGE_PER_SECOND = 0.45;
const WATER_SPEED = 12;
const WATER_GRAVITY = 18;
const WATER_SEGMENT_DT = 0.06;
const WATER_SEGMENT_COUNT = 20;

const _boxSize = new THREE.Vector3();
const _boxCenter = new THREE.Vector3();
const _halfExtents = new THREE.Vector3();
const _localHit = new THREE.Vector3();
const _worldHit = new THREE.Vector3();
const _localNormal = new THREE.Vector3();
const _worldNormal = new THREE.Vector3();
const _ray = new THREE.Ray();
const _localRay = new THREE.Ray();
const _inverseMatrix = new THREE.Matrix4();
const _hitToCenter = new THREE.Vector3();
const _tmpQuat = new THREE.Quaternion();
const _tmpVec = new THREE.Vector3();
const _segmentStart = new THREE.Vector3();
const _segmentEnd = new THREE.Vector3();
const _segmentDir = new THREE.Vector3();
const _segmentVelocity = new THREE.Vector3();
const _localSegmentHit = new THREE.Vector3();

function createFlameTexture() {

	const canvas = document.createElement( 'canvas' );
	canvas.width = 64;
	canvas.height = 96;

	const ctx = canvas.getContext( '2d' );
	const gradient = ctx.createRadialGradient( 32, 28, 6, 32, 48, 34 );
	gradient.addColorStop( 0.0, 'rgba(255,255,255,1)' );
	gradient.addColorStop( 0.2, 'rgba(255,247,192,1)' );
	gradient.addColorStop( 0.48, 'rgba(255,174,70,0.95)' );
	gradient.addColorStop( 0.78, 'rgba(255,88,24,0.65)' );
	gradient.addColorStop( 1.0, 'rgba(255,88,24,0)' );

	ctx.fillStyle = gradient;
	ctx.beginPath();
	ctx.moveTo( 32, 6 );
	ctx.quadraticCurveTo( 52, 38, 44, 72 );
	ctx.quadraticCurveTo( 32, 92, 20, 72 );
	ctx.quadraticCurveTo( 12, 38, 32, 6 );
	ctx.fill();

	const texture = new THREE.CanvasTexture( canvas );
	texture.needsUpdate = true;
	return texture;

}

function createTargetVisual( woodModel, flameTexture ) {

	const group = new THREE.Group();
	const wood = woodModel.clone();
	wood.traverse( ( child ) => {

		if ( ! child.isMesh ) return;
		child.castShadow = true;
		child.receiveShadow = true;

	} );

	wood.updateMatrixWorld( true );
	const rawBounds = new THREE.Box3().setFromObject( wood );
	const rawSize = rawBounds.getSize( new THREE.Vector3() );
	const targetWidth = 1.05;
	const scale = targetWidth / Math.max( rawSize.x, rawSize.z, 1e-4 );
	wood.scale.setScalar( scale );
	wood.updateMatrixWorld( true );

	const scaledBounds = new THREE.Box3().setFromObject( wood );
	const scaledCenter = scaledBounds.getCenter( new THREE.Vector3() );
	wood.position.sub( scaledCenter );
	wood.position.y -= scaledBounds.min.y;
	wood.updateMatrixWorld( true );

	const localBounds = new THREE.Box3().setFromObject( wood );
	localBounds.getSize( _boxSize );
	localBounds.getCenter( _boxCenter );

	const colliderBox = new THREE.Box3().copy( localBounds );
	colliderBox.min.y = 0;
	colliderBox.max.y += 0.75;

	group.add( wood );

	const debugCollider = new THREE.Mesh(
		new THREE.BoxGeometry(
			colliderBox.max.x - colliderBox.min.x,
			colliderBox.max.y - colliderBox.min.y,
			colliderBox.max.z - colliderBox.min.z
		),
		new THREE.MeshBasicMaterial( {
			color: 0xff6633,
			wireframe: true,
			transparent: true,
			opacity: 0.75,
			depthWrite: false,
		} )
	);
	debugCollider.position.copy( colliderBox.getCenter( new THREE.Vector3() ) );
	debugCollider.visible = false;
	group.add( debugCollider );

	const flameGroup = new THREE.Group();
	group.add( flameGroup );

	const flameCore = new THREE.Mesh(
		new THREE.SphereGeometry( 0.34, 16, 12 ),
		new THREE.MeshStandardMaterial( {
			color: 0xff8a28,
			emissive: 0xff5a10,
			emissiveIntensity: 2.0,
			transparent: true,
			opacity: 0.85,
			roughness: 0.4,
			metalness: 0.0,
		} )
	);
	flameCore.position.set( 0, colliderBox.max.y + 0.2, 0 );
	flameCore.castShadow = false;
	group.add( flameCore );

	const flameSprites = [];
	const flameOffsets = [
		new THREE.Vector3( -0.2, colliderBox.max.y - 0.14, -0.08 ),
		new THREE.Vector3( 0.17, colliderBox.max.y - 0.02, 0.1 ),
		new THREE.Vector3( 0.02, colliderBox.max.y + 0.22, -0.03 ),
	];

	for ( let i = 0; i < flameOffsets.length; i ++ ) {

		const sprite = new THREE.Sprite( new THREE.SpriteMaterial( {
			map: flameTexture,
			transparent: true,
			depthWrite: false,
			opacity: 0.9,
			color: i === 2 ? 0xfff0ba : 0xff8a33,
			blending: THREE.AdditiveBlending,
		} ) );
		sprite.position.copy( flameOffsets[ i ] );
		sprite.scale.set( 1.4, 2.1, 1 );
		flameGroup.add( sprite );
		flameSprites.push( {
			sprite,
			baseOffset: flameOffsets[ i ].clone(),
			phase: Math.random() * Math.PI * 2,
			scale: 0.72 + i * 0.16,
		} );

	}

	return { group, colliderBox, debugCollider, flameGroup, flameCore, flameSprites };

}

function computeWorldBoxNormal( target, localHit ) {

	target.colliderBox.getCenter( _boxCenter );
	target.colliderBox.getSize( _boxSize );
	_halfExtents.copy( _boxSize ).multiplyScalar( 0.5 );
	_hitToCenter.subVectors( localHit, _boxCenter );

	const nx = Math.abs( _hitToCenter.x / Math.max( _halfExtents.x, 1e-4 ) );
	const ny = Math.abs( _hitToCenter.y / Math.max( _halfExtents.y, 1e-4 ) );
	const nz = Math.abs( _hitToCenter.z / Math.max( _halfExtents.z, 1e-4 ) );

	_localNormal.set( 0, 0, 0 );

	if ( nx >= ny && nx >= nz ) {

		_localNormal.x = Math.sign( _hitToCenter.x ) || 1;

	} else if ( ny >= nz ) {

		_localNormal.y = Math.sign( _hitToCenter.y ) || 1;

	} else {

		_localNormal.z = Math.sign( _hitToCenter.z ) || 1;

	}

	target.group.getWorldQuaternion( _tmpQuat );
	return _worldNormal.copy( _localNormal ).applyQuaternion( _tmpQuat ).normalize();

}

function intersectSegmentBox( target, start, end ) {

	_segmentDir.subVectors( end, start );
	const segmentLength = _segmentDir.length();
	if ( segmentLength < 1e-5 ) return null;

	_segmentDir.multiplyScalar( 1 / segmentLength );
	_ray.origin.copy( start );
	_ray.direction.copy( _segmentDir );

	target.group.updateWorldMatrix( true, false );
	_inverseMatrix.copy( target.group.matrixWorld ).invert();
	_localRay.copy( _ray ).applyMatrix4( _inverseMatrix );

	if ( ! _localRay.intersectBox( target.colliderBox, _localSegmentHit ) ) return null;

	_worldHit.copy( _localSegmentHit ).applyMatrix4( target.group.matrixWorld );
	if ( _worldHit.distanceTo( start ) > segmentLength + 1e-4 ) return null;

	return {
		point: _worldHit.clone(),
		normal: computeWorldBoxNormal( target, _localSegmentHit ).clone(),
	};

}

export class FireTargetSystem {

	constructor( scene, effects, woodModel, positions = [] ) {

		this.scene = scene;
		this.effects = effects;
		this.woodModel = woodModel;
		this.targets = [];
		this.flameTexture = createFlameTexture();
		this.debugVisible = false;

		for ( const position of positions ) {

			this.addTarget( position );

		}

	}

	addTarget( position ) {

		const targetVisual = createTargetVisual( this.woodModel, this.flameTexture );
		const group = targetVisual.group;
		group.position.set( position.x, position.y ?? 0, position.z );
		group.rotation.y = position.rotationY ?? 0;
		targetVisual.debugCollider.visible = this.debugVisible;
		this.scene.add( group );

		this.targets.push( {
			group,
			colliderBox: targetVisual.colliderBox,
			debugCollider: targetVisual.debugCollider,
			flameCore: targetVisual.flameCore,
			flameSprites: targetVisual.flameSprites,
			fireAmount: position.fireAmount ?? 1,
			extinguished: false,
		} );

	}

	setDebugVisible( visible ) {

		this.debugVisible = visible;

		for ( const target of this.targets ) {

			target.debugCollider.visible = visible;

		}

	}

	update( dt, elapsedTime ) {

		for ( const target of this.targets ) {

			const fireLevel = target.extinguished ? 0 : target.fireAmount;
			target.flameCore.visible = fireLevel > 0;
			if ( fireLevel > 0 ) {

				const corePulse = 0.85 + fireLevel * 0.4 + Math.sin( elapsedTime * 4.5 ) * 0.06;
				target.flameCore.scale.setScalar( corePulse );
				target.flameCore.material.emissiveIntensity = 1.2 + fireLevel * 1.6;
				target.flameCore.material.opacity = 0.55 + fireLevel * 0.25;

			}

			for ( const flame of target.flameSprites ) {

				flame.sprite.visible = fireLevel > 0;
				if ( fireLevel <= 0 ) continue;

				const pulse = 0.8 + fireLevel * 0.45 + Math.sin( elapsedTime * 5 + flame.phase ) * 0.08;
				flame.sprite.position.copy( flame.baseOffset );
				flame.sprite.position.y += Math.sin( elapsedTime * 3 + flame.phase ) * 0.07;
				flame.sprite.scale.set( flame.scale * pulse, flame.scale * pulse * 1.5, 1 );
				flame.sprite.material.opacity = 0.4 + fireLevel * 0.5;

			}

		}

	}

	spray( origin, direction, maxRange, dt ) {

		_segmentStart.copy( origin );
		_segmentVelocity.copy( direction ).multiplyScalar( WATER_SPEED );
		let travelled = 0;

		for ( let i = 0; i < WATER_SEGMENT_COUNT; i ++ ) {

			_segmentEnd.copy( _segmentStart ).addScaledVector( _segmentVelocity, WATER_SEGMENT_DT );
			travelled += _segmentStart.distanceTo( _segmentEnd );
			if ( travelled > maxRange ) break;

			for ( const target of this.targets ) {

				if ( target.extinguished || target.fireAmount <= 0 ) continue;

				const hit = intersectSegmentBox( target, _segmentStart, _segmentEnd );
				if ( ! hit ) continue;

				target.fireAmount = Math.max( 0, target.fireAmount - dt * FIRE_DAMAGE_PER_SECOND );

				if ( target.fireAmount <= 0 && ! target.extinguished ) {

					target.extinguished = true;
					target.fireAmount = 0;
					_tmpVec.copy( target.group.position );
					_tmpVec.y += target.colliderBox.max.y * 0.6;
					this.effects.emitExtinguishSmoke( _tmpVec, 18 );

				}

				return {
					hit: true,
					target,
					impactPoint: hit.point,
					impactNormal: hit.normal,
					distance: origin.distanceTo( hit.point ),
					travelTime: i * WATER_SEGMENT_DT + _segmentStart.distanceTo( hit.point ) / Math.max( _segmentVelocity.length(), 1e-4 ),
				};

			}

			_segmentStart.copy( _segmentEnd );
			_segmentVelocity.y -= WATER_GRAVITY * WATER_SEGMENT_DT;

		}

		return null;

	}

	getActiveCount() {

		let count = 0;

		for ( const target of this.targets ) {

			if ( ! target.extinguished && target.fireAmount > 0 ) count ++;

		}

		return count;

	}

}
